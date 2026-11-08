module Test.WebSocket (spec) where

import Prelude

import Data.Maybe (Maybe(..))
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Number (infinity, nan)
import Data.Time.Duration (Milliseconds(..))
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (text)
import Screamer.Element as E
import Screamer.Event as Event
import Screamer.Signal (readT0, subscribe)
import Screamer.Source (batch)
import Screamer.Host (withHost)
import Screamer.Owned (runOwned)
import Screamer.Test.Clock (fakeHost)
import Screamer.Test.Dom (innerHTML, liveListeners, resetBody)
import Screamer.Web.WebSocket as WebSocket
import Test.MockWebSocket as Mock
import Test.Stubs as Stubs
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (fail, shouldEqual)

spec :: Spec Unit
spec = before_ (liftEffect Mock.installMockWebSocket) $ after_ (liftEffect Mock.uninstallMockWebSocket) $ describe "Screamer.Web.WebSocket" do
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
      latest <- Event.stepper "" s.messages
      pure $ text latest
    liftEffect (Ref.read sock) >>= case _ of
      Nothing -> pure unit
      Just s -> do
        liftEffect $ s.send "early"
        liftEffect Mock.serverOpen
        liftEffect $ s.send "hello"
        liftEffect $ Mock.serverSend "pong"
        liftEffect (innerHTML "#root") >>= shouldEqual "pong"
        liftEffect $ Mock.serverSend "pong"
        liftEffect (Ref.read received) >>= shouldEqual [ "pong", "pong" ]
    liftEffect unmount
    info <- liftEffect Mock.socketInfo
    info `shouldEqual` { url: "ws://example.test/chat", sent: [ "early", "hello" ], closed: true }
    liftEffect (Ref.read states) >>= shouldEqual [ "Connecting", "Open" ]

  it "validates reconnect delays without fabricating a policy" do
    let make a b = const unit <$> WebSocket.reconnectPolicy (Milliseconds a) (Milliseconds b)
    make 0.0 10.0 `shouldEqual` Left WebSocket.NonPositiveDelay
    make 10.0 5.0 `shouldEqual` Left WebSocket.MaximumBeforeInitial
    make nan 10.0 `shouldEqual` Left WebSocket.NonFiniteDelay
    make 1.0 infinity `shouldEqual` Left WebSocket.NonFiniteDelay
    make 1.0 10.0 `shouldEqual` Right unit

  it "keeps streams stable across attempts, drops disconnected sends and ignores obsolete sockets" do
    listeners <- liftEffect liveListeners
    clock <- liftEffect $ fakeHost 100.0
    received <- liftEffect $ Ref.new []
    opens <- liftEffect $ Ref.new 0
    scope <- liftEffect $ runOwned $ withHost clock.host do
      s <- WebSocket.connectWith WebSocket.defaultReconnectOptions "ws://example.test/chat"
      Event.subscribe s.messages \m -> Ref.modify_ (_ <> [ m ]) received
      Event.subscribe s.opened \_ -> Ref.modify_ (_ + 1) opens
      pure s
    let s = scope.value
    liftEffect $ s.send "early"
    liftEffect Mock.serverOpen
    liftEffect $ s.send "hello"
    liftEffect $ Mock.serverSend "same"
    liftEffect $ Mock.serverSend "same"
    liftEffect (Ref.read received) >>= shouldEqual [ "same", "same" ]
    liftEffect Mock.socketInfo >>= shouldEqual { url: "ws://example.test/chat", sent: [ "hello" ], closed: false }
    let closed = { code: 1006, reason: "network lost", wasClean: false }
    liftEffect $ Mock.serverClose closed
    liftEffect (readT0 s.state) >>= case _ of
      WebSocket.Reconnecting r -> r `shouldEqual` { attempt: 1, nextAt: 1100.0, close: closed }
      other -> fail (show other)
    liftEffect $ s.send "dropped"
    liftEffect $ clock.advance 999.0
    liftEffect Mock.socketCount >>= shouldEqual 1
    liftEffect $ clock.advance 1.0
    liftEffect Mock.socketCount >>= shouldEqual 2
    liftEffect Mock.serverOpen
    liftEffect Mock.staleEvents
    liftEffect $ s.send "again"
    liftEffect $ Mock.serverSend "new"
    liftEffect (show <$> readT0 s.state) >>= shouldEqual "Connected"
    liftEffect (Ref.read opens) >>= shouldEqual 2

    liftEffect (Ref.read received) >>= shouldEqual [ "same", "same", "new" ]
    liftEffect Mock.socketInfo >>= shouldEqual { url: "ws://example.test/chat", sent: [ "again" ], closed: false }
    liftEffect Mock.listenerCount >>= shouldEqual 3
    liftEffect scope.dispose
    liftEffect Mock.listenerCount >>= shouldEqual 0
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect $ s.send "after disposal"
    liftEffect Mock.staleEvents
    liftEffect (Ref.read opens) >>= shouldEqual 2
    liftEffect liveListeners >>= shouldEqual listeners

  it "doubles and caps backoff without observers, resets on open, and cancels on disposal" do
    clock <- liftEffect $ fakeHost 0.0
    scope <- liftEffect $ runOwned $ withHost clock.host $
      WebSocket.connectWith WebSocket.defaultReconnectOptions "ws://example.test/"
    for_ [ 1000.0, 2000.0, 4000.0, 8000.0, 16000.0, 30000.0, 30000.0 ] \delay -> do
      before <- liftEffect Mock.socketCount
      liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
      liftEffect clock.scheduled >>= shouldEqual 1
      liftEffect $ clock.advance (delay - 1.0)
      liftEffect Mock.socketCount >>= shouldEqual before
      liftEffect $ clock.advance 1.0
      liftEffect Mock.socketCount >>= shouldEqual (before + 1)
    liftEffect Mock.serverOpen
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    before <- liftEffect Mock.socketCount
    liftEffect $ clock.advance 1000.0
    liftEffect Mock.socketCount >>= shouldEqual (before + 1)
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    liftEffect scope.dispose
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect $ clock.advance 100000.0
    liftEffect Mock.socketCount >>= shouldEqual (before + 1)
    liftEffect Mock.listenerCount >>= shouldEqual 0

  it "skips initial Page values and coalesces online/visible retries" do
    liftEffect $ Stubs.setOnline true
    liftEffect $ Stubs.setVisibility "visible"
    clock <- liftEffect $ fakeHost 0.0
    scope <- liftEffect $ runOwned $ withHost clock.host $
      WebSocket.connectWith WebSocket.defaultReconnectOptions "ws://example.test/"
    liftEffect Mock.socketCount >>= shouldEqual 1
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    liftEffect $ batch do
      Stubs.setOnline false
      Stubs.setVisibility "hidden"
    liftEffect $ batch do
      Stubs.setOnline true
      Stubs.setVisibility "visible"
    liftEffect Mock.socketCount >>= shouldEqual 2
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect $ clock.advance 10000.0
    liftEffect Mock.socketCount >>= shouldEqual 2
    let normal = { code: 1000, reason: "finished", wasClean: true }
    liftEffect $ Mock.serverClose normal
    liftEffect (readT0 scope.value.state) >>= case _ of
      WebSocket.Disconnected info -> info `shouldEqual` normal
      other -> fail (show other)
    liftEffect $ Stubs.setOnline false *> Stubs.setOnline true
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect Mock.socketCount >>= shouldEqual 2
    liftEffect scope.dispose

  it "supports disabled retries, application close policy and constructor failures" do
    clock <- liftEffect $ fakeHost 0.0
    let connect options = runOwned $ withHost clock.host $ WebSocket.connectWith options "ws://example.test/"
    once <- liftEffect $ connect (WebSocket.defaultReconnectOptions { reconnect = Nothing })
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect once.dispose
    custom <- liftEffect $ connect (WebSocket.defaultReconnectOptions { shouldReconnect = \info -> info.code /= 4001 })
    liftEffect $ Mock.serverClose { code: 4001, reason: "signed out", wasClean: true }
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect custom.dispose
    liftEffect Mock.failNextOpen
    broken <- liftEffect $ connect WebSocket.defaultReconnectOptions
    liftEffect (readT0 broken.value.state) >>= case _ of
      WebSocket.ConnectionFailed _ -> pure unit
      other -> fail (show other)
    liftEffect clock.scheduled >>= shouldEqual 0
    liftEffect broken.dispose
    liftEffect Mock.listenerCount >>= shouldEqual 0

  it "can disable Page-triggered retries and releases a still-connecting socket" do
    listeners <- liftEffect liveListeners
    clock <- liftEffect $ fakeHost 0.0
    scope <- liftEffect $ runOwned $ withHost clock.host $
      WebSocket.connectWith (WebSocket.defaultReconnectOptions { retryOnOnline = false }) "ws://example.test/"
    liftEffect liveListeners >>= shouldEqual listeners
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    liftEffect $ Stubs.setOnline false *> Stubs.setOnline true
    liftEffect $ Stubs.setVisibility "hidden" *> Stubs.setVisibility "visible"
    liftEffect Mock.socketCount >>= shouldEqual 1
    liftEffect clock.scheduled >>= shouldEqual 1
    liftEffect $ clock.advance 1000.0
    liftEffect scope.dispose
    liftEffect Mock.socketInfo >>= shouldEqual { url: "ws://example.test/", sent: [], closed: true }
    liftEffect Mock.listenerCount >>= shouldEqual 0
    liftEffect Mock.staleEvents
    liftEffect clock.scheduled >>= shouldEqual 0

  it "ignores a cancelled timer callback even after a later attempt fails" do
    clock <- liftEffect $ fakeHost 0.0
    callback <- liftEffect $ Ref.new (pure unit)
    let h = clock.host { setTimeout = \delay action -> Ref.write action callback *> clock.host.setTimeout delay action }
    scope <- liftEffect $ runOwned $ withHost h $
      WebSocket.connectWith WebSocket.defaultReconnectOptions "ws://example.test/"
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    oldTimer <- liftEffect $ Ref.read callback
    liftEffect $ Stubs.setOnline false *> Stubs.setOnline true
    liftEffect Mock.socketCount >>= shouldEqual 2
    liftEffect $ Mock.serverClose { code: 1006, reason: "", wasClean: false }
    liftEffect oldTimer
    liftEffect Mock.socketCount >>= shouldEqual 2
    liftEffect clock.scheduled >>= shouldEqual 1
    liftEffect scope.dispose
    liftEffect oldTimer
    liftEffect clock.scheduled >>= shouldEqual 0
