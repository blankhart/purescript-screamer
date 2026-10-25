-- | A WebSocket owned by the current scope: it opens when the scope runs
-- | and closes when the scope is disposed. When the backend is not
-- | interactive (on a server) it opens nothing: `state` stays `Connecting`
-- | and `send` is dropped.
module Screamer.Web.WebSocket
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
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (EventSource, SignalSource, batch, eventSource, signalSource)

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
  live <- interactive
  state <- liftEffect $ signalSource Connecting
  messages <- liftEffect eventSource
  if live then open' url state messages
  else pure { state: state.signal, messages: messages.event, send: \_ -> pure unit }

open'
  :: String
  -> SignalSource ConnectionState
  -> EventSource String
  -> Owned Socket
open' url state messages = do
  queue <- liftEffect $ Ref.new []
  socket <- liftEffect $ Ref.new Nothing
  let
    onOpen = do
      state.putT1 Open
      Ref.read socket >>= case _ of
        Just ws -> do
          pending <- Ref.modify' (\q -> { state: [], value: q }) queue
          for_ pending (sendImpl ws)
        Nothing -> pure unit
    onClose = state.putT1 Closed
    onMessage text = batch $ messages.fireT1 text
  ws <- liftEffect $ open { url, onOpen, onClose, onMessage }
  liftEffect $ Ref.write (Just ws) socket
  onCleanup do
    Ref.write Nothing socket
    state.putT1 Closing
    closeImpl ws
  let
    send text = Ref.read socket >>= case _ of
      Nothing -> pure unit
      Just w -> readT0 state.signal >>= case _ of
        Connecting -> Ref.modify_ (_ <> [ text ]) queue
        Open -> sendImpl w text
        _ -> pure unit
  pure { state: state.signal, messages: messages.event, send }
