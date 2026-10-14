module Test.Subscriptions (spec) where

import Prelude

import Data.Array as Array
import Data.DateTime.Instant (unInstant)
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Data.Newtype (un)
import Data.Time.Duration (Milliseconds(..))
import Effect.Aff (Aff, delay, effectCanceler, makeAff)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Effect.Ref as Ref
import Screamer.SignalSource (signalSource)
import Screamer.Core (text)
import Screamer.Core as Core
import Screamer.Event as Event
import Screamer.Owned (runOwned, subscribe)
import Screamer.Resource (Remote(..), resource)
import Screamer.Signal (read)
import Screamer.Subscriptions.AnimationFrame as AnimationFrame
import Screamer.Subscriptions.Router as Router
import Screamer.Subscriptions.Timer as Timer
import Screamer.Subscriptions.WebSocket as WebSocket
import Test.DomHelpers (click, innerHTML, resetBody)
import Test.Fakes as Fake
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Screamer.Subscriptions" do
  timer
  animationFrame
  webSocket
  router
  resources

timer :: Spec Unit
timer = before_ (liftEffect Fake.installFakeTimers) $ after_ (liftEffect Fake.uninstallFakeTimers) $ describe "Timer" do
  it "every updates the time each interval and stops on dispose" do
    r <- liftEffect $ runOwned (Timer.every (Milliseconds 100.0))
    let ms = map (un Milliseconds <<< unInstant) (read r.value)
    t0 <- liftEffect ms
    liftEffect $ Fake.advance 250.0
    t1 <- liftEffect ms
    (t1 - t0) `shouldEqual` 200.0
    liftEffect r.dispose
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    liftEffect $ Fake.advance 1000.0
    liftEffect ms >>= shouldEqual t1

  it "after runs once, and not at all when disposed first" do
    log <- liftEffect $ Ref.new []
    a <- liftEffect $ runOwned (Timer.after (Milliseconds 50.0) (Ref.modify_ (_ <> [ "a" ]) log))
    b <- liftEffect $ runOwned (Timer.after (Milliseconds 50.0) (Ref.modify_ (_ <> [ "b" ]) log))
    liftEffect b.dispose
    liftEffect $ Fake.advance 200.0
    liftEffect (Ref.read log) >>= shouldEqual [ "a" ]
    liftEffect a.dispose

animationFrame :: Spec Unit
animationFrame = before_ (liftEffect Fake.installFakeFrames) $ after_ (liftEffect Fake.uninstallFakeFrames) $ describe "AnimationFrame" do
  it "frames follows the frame timestamps and stops on dispose" do
    r <- liftEffect $ runOwned AnimationFrame.frames
    liftEffect $ Fake.frame 16.0
    liftEffect (read r.value) >>= shouldEqual 16.0
    liftEffect $ Fake.frame 33.0
    liftEffect (read r.value) >>= shouldEqual 33.0
    liftEffect r.dispose
    liftEffect Fake.pendingFrames >>= shouldEqual 0

  it "every runs the action each frame until disposed" do
    count <- liftEffect $ Ref.new 0
    r <- liftEffect $ runOwned (AnimationFrame.every (Ref.modify_ (_ + 1) count))
    liftEffect do
      Fake.frame 1.0
      Fake.frame 2.0
      Fake.frame 3.0
      r.dispose
      Fake.frame 4.0
    liftEffect (Ref.read count) >>= shouldEqual 3

webSocket :: Spec Unit
webSocket = before_ (liftEffect Fake.installMockWebSocket) $ after_ (liftEffect Fake.uninstallMockWebSocket) $ describe "WebSocket" do
  it "queues sends until open, exposes state and messages, and closes on unmount" do
    liftEffect resetBody
    states <- liftEffect $ Ref.new []
    sock <- liftEffect $ Ref.new Nothing
    received <- liftEffect $ Ref.new []
    unmount <- liftEffect $ Core.mount "#root" $ Core.component do
      s <- WebSocket.connect "ws://example.test/chat"
      subscribe s.state \st -> Ref.modify_ (_ <> [ show st ]) states
      liftEffect $ Ref.write (Just s) sock
      Event.subscribe s.messages \m -> Ref.modify_ (_ <> [ m ]) received
      pure $ text (s.message <#> maybe "" _.data)
    liftEffect (Ref.read sock) >>= case _ of
      Nothing -> pure unit
      Just s -> do
        liftEffect $ s.send "early"
        liftEffect Fake.serverOpen
        liftEffect $ s.send "hello"
        liftEffect $ Fake.serverSend "pong"
        liftEffect (innerHTML "#root") >>= shouldEqual "pong"
        liftEffect $ Fake.serverSend "pong"
        liftEffect (read s.message) >>= shouldEqual (Just { index: 1, data: "pong" })
        liftEffect (Ref.read received) >>= shouldEqual [ "pong", "pong" ]
    liftEffect unmount
    info <- liftEffect Fake.socketInfo
    info `shouldEqual` { url: "ws://example.test/chat", sent: [ "early", "hello" ], closed: true }
    liftEffect (Ref.read states) >>= shouldEqual [ "Connecting", "Open" ]
  where
  maybe d f = case _ of
    Nothing -> d
    Just x -> f x

router :: Spec Unit
router = describe "Router" do
  it "follows navigate, redirect, links and popstate" do
    liftEffect resetBody
    liftEffect $ Router.redirect "/start"
    unmount <- liftEffect $ Core.mount "#root" $ Core.component do
      loc <- Router.location
      pure $ Core.fragment_
        [ Router.link "/about?x=1#top" [] [ Core.element "about" ]
        , Core.element_ "p" [] [ text (loc <#> \l -> l.pathname <> l.search <> l.hash) ]
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
