module Test.Primitives (spec) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Aff (Aff, delay, effectCanceler, makeAff)
import Effect.Class (liftEffect)
import Effect.Class as Owned
import Effect.Exception (message, throw)
import Effect.Ref as Ref
import Screamer.Context (class ContextKey, ask, provide)
import Screamer.Element (Element(..), catchError, component, dyn, each, element, element_, instantiate, mount, portal, suspense, text, withLeave)
import Screamer.Host (Host, withHost)
import Screamer.Resource (Remote(..), resource)
import Screamer.Runtime (readStats)
import Screamer.Source (signalSource)
import Screamer.Test.Clock (fakeHost)
import Screamer.Test.Dom (innerHTML, resetBody)
import Test.Backend (addTarget, crash)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Type.Proxy (Proxy(..))
import Web.DOM.Node (Node)

data Who

instance ContextKey Who String where
  keyName _ = "Test.Primitives.Who"
  keyDefault _ = "nobody"

type Leak = { effects :: Int, scopes :: Int, links :: Int }

-- | Run the action and report how many effects, scopes and links it left.
leaks :: Aff Unit -> Aff Leak
leaks action = do
  before <- liftEffect readStats
  action
  after <- liftEffect readStats
  pure { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }

noLeak :: Leak
noLeak = { effects: 0, scopes: 0, links: 0 }

-- | Wait on the host's timer.
sleep :: Host -> Number -> Aff Unit
sleep h ms = makeAff \k -> effectCanceler <$> h.setTimeout ms (k (Right unit))

showRemote :: Remote Int -> String
showRemote = case _ of
  Loaded v -> show v
  Loading -> "loading"
  Failed e -> message e

-- | Let fibers run.
yield :: Aff Unit
yield = delay (Milliseconds 0.0)

spec :: Spec Unit
spec = describe "framework primitives" do
  describe "portal" do
    it "renders into the target, sees the context, and is removed with its parent" do
      liftEffect $ resetBody *> addTarget "modal"
      shown <- liftEffect $ signalSource true
      let
        k = Proxy :: Proxy Who
        dialog = component do
          who <- ask k
          pure $ portal "#modal" (element_ "p" [] [ element ("hello " <> who) ])
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ Element $ provide k "Ada" $ instantiate $
          element_ "div" [] [ dyn (shown.signal <#> if _ then dialog else element "closed") ]
        liftEffect (innerHTML "#modal") >>= shouldEqual "<p>hello Ada</p>"
        liftEffect (innerHTML "#root") >>= shouldEqual "<div><!----><!----><!----></div>"
        liftEffect $ shown.putT1 false
        liftEffect (innerHTML "#modal") >>= shouldEqual ""
        liftEffect $ shown.putT1 true
        liftEffect (innerHTML "#modal") >>= shouldEqual "<p>hello Ada</p>"
        liftEffect unmount
        liftEffect (innerHTML "#modal") >>= shouldEqual ""
      l `shouldEqual` noLeak

  describe "catchError" do
    it "replaces a child that throws while it is built" do
      liftEffect resetBody
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "div" []
          [ catchError (\e -> element ("caught " <> message e)) $ component do
              _ <- Owned.liftEffect (throw "setup failed")
              pure (element "unreachable")
          , element "after"
          ]
        liftEffect (innerHTML "#root") >>= shouldEqual "<div><!---->caught setup failed<!---->after</div>"
        liftEffect unmount
      l `shouldEqual` noLeak

    it "replaces a child whose effect throws later, and disposes it" do
      liftEffect resetBody
      n <- liftEffect $ signalSource 1
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "div" []
          [ catchError (\e -> element_ "b" [] [ element (message e) ]) $
              element_ "i" [] [ text (n.signal <#> \x -> if x > 1 then crash "too big" else show x) ]
          ]
        liftEffect (innerHTML "#root") >>= shouldEqual "<div><!----><i>1</i><!----></div>"
        liftEffect $ n.putT1 2
        liftEffect (innerHTML "#root") >>= shouldEqual "<div><!----><b>too big</b><!----></div>"
        -- The failed child is gone: further writes reach nothing.
        liftEffect $ n.putT1 3
        liftEffect (innerHTML "#root") >>= shouldEqual "<div><!----><b>too big</b><!----></div>"
        liftEffect unmount
      l `shouldEqual` noLeak

    it "lets an error from the handler's element reach the enclosing boundary" do
      liftEffect resetBody
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $
          catchError (\e -> element ("outer: " <> message e)) $
            catchError (\_ -> component (Owned.liftEffect (throw "handler failed"))) $
              component (Owned.liftEffect (throw "inner failed"))
        liftEffect (innerHTML "#root") >>= shouldEqual "<!---->outer: handler failed<!---->"
        liftEffect unmount
      l `shouldEqual` noLeak

  describe "suspense" do
    it "shows the fallback until the content's resource loads, then the content" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      let
        content = component do
          res <- resource (pure 7) \x -> sleep fh.host 100.0 $> x * 6
          pure $ element_ "p" [] [ text (showRemote <$> res) ]
        page = Element $ withHost fh.host $ instantiate $
          element_ "main" [] [ suspense (element_ "i" [] [ element "wait" ]) content ]
      l <- leaks do
        unmount <- liftEffect $ mount "#root" page
        liftEffect (innerHTML "#root") >>= shouldEqual "<main><!----><i>wait</i><!----></main>"
        liftEffect $ fh.advance 50.0
        yield
        liftEffect (innerHTML "#root") >>= shouldEqual "<main><!----><i>wait</i><!----></main>"
        liftEffect $ fh.advance 50.0
        yield
        liftEffect (innerHTML "#root") >>= shouldEqual "<main><!----><p>42</p><!----></main>"
        liftEffect unmount
      l `shouldEqual` noLeak

    it "shows content with nothing pending at once" do
      liftEffect resetBody
      built <- liftEffect $ Ref.new 0
      let fallback = component (Owned.liftEffect (Ref.modify_ (_ + 1) built) $> element "wait")
      unmount <- liftEffect $ mount "#root" $ suspense fallback (element "ready")
      liftEffect (innerHTML "#root") >>= shouldEqual "<!---->ready<!---->"
      liftEffect (Ref.read built) >>= shouldEqual 0
      liftEffect unmount

  describe "withLeave" do
    it "keeps removed rows until the hook says done, and disposes their scopes at once" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2, 3 ]
      leaving <- liftEffect $ Ref.new ([] :: Array { node :: Node, done :: Effect Unit })
      let hook node done = Ref.modify_ (_ <> [ { node, done } ]) leaving
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "ul" []
          [ withLeave hook $ each identity items.signal \s -> element_ "li" [] [ text (show <$> s) ] ]
        mid <- leaks do
          liftEffect $ items.putT1 [ 1, 3 ]
        -- The row's scope (and its text effect) is gone, its node is not.
        mid `shouldEqual` { effects: -1, scopes: -1, links: -2 }
        liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>1</li><li>2</li><li>3</li><!----></ul>"
        pending <- liftEffect $ Ref.read leaving
        Array.length pending `shouldEqual` 1
        liftEffect $ for_ pending _.done
        liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>1</li><li>3</li><!----></ul>"
        liftEffect unmount
      l `shouldEqual` noLeak

    it "removes leaving nodes at once when the enclosing scope is disposed" do
      liftEffect resetBody
      tab <- liftEffect $ signalSource "a"
      leaving <- liftEffect $ Ref.new ([] :: Array (Effect Unit))
      shown <- liftEffect $ signalSource true
      let
        hook _ done = Ref.modify_ (_ <> [ done ]) leaving
        tabs = withLeave hook $ dyn (tab.signal <#> \t -> element_ "p" [] [ element t ])
      unmount <- liftEffect $ mount "#root" $ element_ "div" []
        [ dyn (shown.signal <#> if _ then tabs else element "none") ]
      liftEffect $ tab.putT1 "b"
      liftEffect (innerHTML "#root") >>= shouldEqual "<div><!----><!----><p>a</p><p>b</p><!----><!----></div>"
      liftEffect $ shown.putT1 false
      liftEffect (innerHTML "#root") >>= shouldEqual "<div><!---->none<!----></div>"
      -- A late done is harmless.
      liftEffect $ Ref.read leaving >>= \ds -> for_ ds identity
      liftEffect (innerHTML "#root") >>= shouldEqual "<div><!---->none<!----></div>"
      liftEffect unmount
