module Test.WebSocket (spec) where

import Prelude

import Data.Maybe (Maybe(..))
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (text)
import Screamer.Element as E
import Screamer.Event as Event
import Screamer.Signal (subscribe)
import Screamer.Test.Dom (innerHTML, resetBody)
import Screamer.Web.WebSocket as WebSocket
import Test.MockWebSocket as Mock
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)

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
