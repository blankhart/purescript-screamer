module Test.Subscriptions (spec) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Data.Time.Duration (Milliseconds(..))
import Effect.Aff (Aff, delay, effectCanceler, makeAff)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Effect.Ref as Ref
import Screamer.Element (text)
import Screamer.Element as E
import Screamer.Event as Event
import Screamer.Owned (runOwned)
import Screamer.Resource (Remote(..), resource)
import Screamer.Signal (read, subscribe)
import Screamer.Source (signalSource)
import Screamer.Subscriptions.Router as Router
import Screamer.Subscriptions.WebSocket as WebSocket
import Test.DomHelpers (click, innerHTML, resetBody)
import Test.Fakes as Fake
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Screamer.Subscriptions" do
  webSocket
  router
  resources

webSocket :: Spec Unit
webSocket = before_ (liftEffect Fake.installMockWebSocket) $ after_ (liftEffect Fake.uninstallMockWebSocket) $ describe "WebSocket" do
  it "queues sends until open, exposes state and messages, and closes on unmount" do
    liftEffect resetBody
    states <- liftEffect $ Ref.new []
    sock <- liftEffect $ Ref.new Nothing
    received <- liftEffect $ Ref.new []
    unmount <- liftEffect $ E.mount "#root" $ E.component do
      s <- WebSocket.connect "ws://example.test/chat"
      subscribe s.state \st -> Ref.modify_ (_ <> [ show st ]) states
      liftEffect $ Ref.write (Just s) sock
      Event.subscribe s.messages \m -> Ref.modify_ (_ <> [ m ]) received
      pure $ text (Event.stepper "" s.messages)
    liftEffect (Ref.read sock) >>= case _ of
      Nothing -> pure unit
      Just s -> do
        liftEffect $ s.send "early"
        liftEffect Fake.serverOpen
        liftEffect $ s.send "hello"
        liftEffect $ Fake.serverSend "pong"
        liftEffect (innerHTML "#root") >>= shouldEqual "pong"
        liftEffect $ Fake.serverSend "pong"
        liftEffect (Ref.read received) >>= shouldEqual [ "pong", "pong" ]
    liftEffect unmount
    info <- liftEffect Fake.socketInfo
    info `shouldEqual` { url: "ws://example.test/chat", sent: [ "early", "hello" ], closed: true }
    liftEffect (Ref.read states) >>= shouldEqual [ "Connecting", "Open" ]

router :: Spec Unit
router = describe "Router" do
  it "follows navigate, redirect, links and popstate" do
    liftEffect resetBody
    liftEffect $ Router.redirect "/start"
    unmount <- liftEffect $ E.mount "#root" $ E.component do
      loc <- Router.location
      pure $ E.fragment_
        [ Router.link "/about?x=1#top" [] [ E.element "about" ]
        , E.element_ "p" [] [ text (loc <#> \l -> l.pathname <> l.search <> l.hash) ]
        ]
    let shown = innerHTML "#root p"
    liftEffect shown >>= shouldEqual "/start"
    liftEffect $ Router.navigate "/one"
    liftEffect shown >>= shouldEqual "/one"
    liftEffect $ click "#root a"
    liftEffect shown >>= shouldEqual "/about?x=1#top"
    liftEffect $ Router.redirect "/two"
    liftEffect shown >>= shouldEqual "/two"
    liftEffect unmount

resources :: Spec Unit
resources = describe "resource" do
  it "never shows a stale result when the input changes mid-flight" do
    pending <- liftEffect $ Ref.new []
    killed <- liftEffect $ Ref.new []
    let
      request :: Int -> Aff String
      request n = makeAff \cb -> do
        Ref.modify_ (_ <> [ { n, cb } ]) pending
        pure $ effectCanceler (Ref.modify_ (_ <> [ n ]) killed)
      resolve n v = Ref.read pending >>= \ps ->
        for_ (Array.find (\p -> p.n == n) ps) \p -> p.cb (Right v)
    input <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned (resource input.signal request)
    yield
    liftEffect (read r.value) >>= shouldEqual Loading
    liftEffect $ input.put 2
    yield
    liftEffect $ resolve 1 "one"
    yield
    liftEffect (read r.value) >>= shouldEqual Loading
    liftEffect $ resolve 2 "two"
    yield
    liftEffect (read r.value) >>= shouldEqual (Loaded "two")
    liftEffect (Ref.read killed) >>= shouldEqual [ 1 ]
    liftEffect $ input.put 3
    yield
    liftEffect r.dispose
    yield
    liftEffect $ resolve 3 "three"
    yield
    liftEffect (read r.value) >>= shouldEqual Loading
    liftEffect (Ref.read killed) >>= shouldEqual [ 1, 3 ]

  it "reports a failed request" do
    input <- liftEffect $ signalSource unit
    r <- liftEffect $ runOwned (resource input.signal \_ -> makeAff \cb -> cb (Left (error "boom")) $> mempty)
    yield
    liftEffect (read r.value) >>= shouldEqual (Failed (error "boom") :: Remote Unit)
    liftEffect r.dispose

-- | Let fibers launched from inside the test's own fiber run: the Aff
-- | scheduler starts them once the current fiber yields.
yield :: Aff Unit
yield = delay (Milliseconds 0.0)
