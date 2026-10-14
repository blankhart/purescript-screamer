-- | A WebSocket owned by the current scope: it opens when the scope runs
-- | and closes when the scope is disposed.
module Screamer.Subscriptions.WebSocket
  ( ConnectionState(..)
  , Message
  , Socket
  , connect
  ) where

import Prelude

import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.SignalSource (signalSource)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal, read)

data ConnectionState = Connecting | Open | Closing | Closed

derive instance Eq ConnectionState

instance Show ConnectionState where
  show = case _ of
    Connecting -> "Connecting"
    Open -> "Open"
    Closing -> "Closing"
    Closed -> "Closed"

-- | A received text message. `index` counts messages from 0, so two equal
-- | messages in a row are still two changes.
type Message = { index :: Int, data :: String }

type Socket =
  { state :: Signal ConnectionState
  , message :: Signal (Maybe Message)
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
  message <- liftEffect $ signalSource Nothing
  count <- liftEffect $ Ref.new 0
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
    onMessage text = do
      index <- Ref.modify' (\i -> { state: i + 1, value: i }) count
      message.put (Just { index, data: text })
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
  pure { state: state.signal, message: message.signal, send }
