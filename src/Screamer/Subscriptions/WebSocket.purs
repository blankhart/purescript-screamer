-- | A WebSocket owned by the current scope: it opens when the scope runs
-- | and closes when the scope is disposed.
module Screamer.Subscriptions.WebSocket
  ( ConnectionState(..)
  , Socket
  , connect
  ) where

import Prelude

import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal, read)
import Screamer.Source (batch, eventSource, signalSource)

data ConnectionState = Connecting | Open | Closing | Closed

derive instance Eq ConnectionState

instance Show ConnectionState where
  show = case _ of
    Connecting -> "Connecting"
    Open -> "Open"
    Closing -> "Closing"
    Closed -> "Closed"

-- | `state` is the connection's state now; `messages` has one occurrence per
-- | received text message, including repeats.
type Socket =
  { state :: Signal ConnectionState
  , messages :: Event String
  , send :: String -> Effect Unit
  }

foreign import data WebSocket :: Type

foreign import open
  :: { url :: String
     , onOpen :: Effect Unit
     , onClose :: Effect Unit
     , onMessage :: String -> Effect Unit
     }
  -> Effect WebSocket

foreign import sendImpl :: WebSocket -> String -> Effect Unit

foreign import closeImpl :: WebSocket -> Effect Unit

-- | Open a socket to the URL. Messages sent while it is still connecting
-- | are queued and sent once it opens; messages sent after it closes are
-- | dropped.
connect :: String -> Owned Socket
connect url = do
  state <- liftEffect $ signalSource Connecting
  messages <- liftEffect eventSource
  queue <- liftEffect $ Ref.new []
  socket <- liftEffect $ Ref.new Nothing
  let
    onOpen = do
      state.put Open
      Ref.read socket >>= case _ of
        Just ws -> do
          pending <- Ref.modify' (\q -> { state: [], value: q }) queue
          for_ pending (sendImpl ws)
        Nothing -> pure unit
    onClose = state.put Closed
    onMessage text = batch $ messages.fire text
  ws <- liftEffect $ open { url, onOpen, onClose, onMessage }
  liftEffect $ Ref.write (Just ws) socket
  onCleanup do
    Ref.write Nothing socket
    state.put Closing
    closeImpl ws
  let
    send text = Ref.read socket >>= case _ of
      Nothing -> pure unit
      Just w -> read state.signal >>= case _ of
        Connecting -> Ref.modify_ (_ <> [ text ]) queue
        Open -> sendImpl w text
        _ -> pure unit
  pure { state: state.signal, messages: messages.event, send }
