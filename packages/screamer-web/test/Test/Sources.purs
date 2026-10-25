module Test.Sources (spec) where

import Prelude

import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Class as Owned
import Effect.Ref as Ref
import Screamer.Element (Element, component, element_, mount, text)
import Screamer.Owned (Owned)
import Screamer.Runtime (readStats)
import Screamer.Signal (Signal)
import Screamer.Test.Dom (innerHTML, liveListeners, resetBody)
import Screamer.Web.MediaQuery as MediaQuery
import Screamer.Web.Observers as Observers
import Screamer.Web.Page as Page
import Screamer.Web.Storage as Storage
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Test.Stubs as Stubs

-- | Mount a component showing the signal, run the steps with an action that
-- | reads what is shown, unmount, and check that nothing is left: no
-- | effect, scope, link, listener or observer.
showing :: forall a. Show a => Owned (Signal a) -> (Aff String -> Aff Unit) -> Aff Unit
showing source steps = do
  liftEffect resetBody
  before <- liftEffect readStats
  listeners <- liftEffect liveListeners
  unmount <- liftEffect $ mount "#root" $ view source
  steps (liftEffect (innerHTML "#root p"))
  liftEffect unmount
  after <- liftEffect readStats
  listenersAfter <- liftEffect liveListeners
  observers <- liftEffect Stubs.liveObservers
  { effects: after.liveEffects - before.liveEffects
  , scopes: after.liveScopes - before.liveScopes
  , links: after.links - before.links
  , listeners: listenersAfter - listeners
  , observers
  } `shouldEqual` { effects: 0, scopes: 0, links: 0, listeners: 0, observers: 0 }

view :: forall a. Show a => Owned (Signal a) -> Element
view source = component do
  s <- source
  pure $ element_ "p" [] [ text (show <$> s) ]

spec :: Spec Unit
spec = describe "Screamer.Web sources" do
  describe "Storage" do
    it "reads the default, persists writes, and follows other tabs" do
      liftEffect Stubs.clearStorage
      put <- liftEffect $ Ref.new Nothing
      let
        theme = do
          src <- Storage.localStorage "theme" "light"
          Owned.liftEffect $ Ref.write (Just src.putT1) put
          pure src.signal
      showing theme \shown -> do
        shown >>= shouldEqual "\"light\""
        liftEffect $ Ref.read put >>= \p -> for_ p (_ $ "dark")
        shown >>= shouldEqual "\"dark\""
        liftEffect (Stubs.storedLocal "theme") >>= shouldEqual "dark"
        liftEffect $ Stubs.otherTabWrites "theme" "sepia"
        shown >>= shouldEqual "\"sepia\""
      -- A fresh source starts from what is stored.
      showing (_.signal <$> Storage.localStorage "theme" "light") \shown ->
        shown >>= shouldEqual "\"sepia\""

  before_ (liftEffect Stubs.installMatchMedia) $ after_ (liftEffect Stubs.uninstallMatchMedia) $
    describe "MediaQuery" do
      it "follows the query's change events" do
        liftEffect $ Stubs.setMedia "(min-width: 600px)" true
        showing (MediaQuery.matches "(min-width: 600px)") \shown -> do
          shown >>= shouldEqual "true"
          liftEffect $ Stubs.setMedia "(min-width: 600px)" false
          shown >>= shouldEqual "false"

  before_ (liftEffect Stubs.installObservers) $ after_ (liftEffect Stubs.uninstallObservers) $
    describe "Observers" do
      it "resize reports the content box and disconnects on cleanup" do
        el <- liftEffect Stubs.newElement
        showing (Observers.resize el) \shown -> do
          shown >>= shouldEqual "{ height: 0.0, width: 0.0 }"
          liftEffect $ Stubs.resizeTo 120.0 30.0
          shown >>= shouldEqual "{ height: 30.0, width: 120.0 }"
          liftEffect Stubs.liveObservers >>= shouldEqual 1

      it "intersecting follows the observer" do
        el <- liftEffect Stubs.newElement
        showing (Observers.intersecting el) \shown -> do
          shown >>= shouldEqual "false"
          liftEffect $ Stubs.intersect true
          shown >>= shouldEqual "true"

  describe "Page" do
    it "visible follows visibilitychange" do
      showing Page.visible \shown -> do
        shown >>= shouldEqual "true"
        liftEffect $ Stubs.setVisibility "hidden"
        shown >>= shouldEqual "false"
        liftEffect $ Stubs.setVisibility "visible"
        shown >>= shouldEqual "true"

    it "online follows online and offline" do
      liftEffect $ Stubs.setOnline true
      showing Page.online \shown -> do
        shown >>= shouldEqual "true"
        liftEffect $ Stubs.setOnline false
        shown >>= shouldEqual "false"
        liftEffect $ Stubs.setOnline true
        shown >>= shouldEqual "true"
