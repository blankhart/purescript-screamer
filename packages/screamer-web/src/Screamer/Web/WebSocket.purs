-- | A WebSocket owned by the current scope: it opens when the scope runs
-- | and closes when the scope is disposed. When the backend is not
-- | interactive (on a server) it opens nothing: `state` stays `Connecting`
-- | and `send` is dropped.
-- | `connectWith` adds scoped reconnection with a separate state type and
-- | dropped disconnected sends; `connect` retains its original behavior.
module Screamer.Web.WebSocket
  ( ConnectionState(..)
  , Socket
  , connect
  , CloseInfo
  , ReconnectState(..)
  , ReconnectingSocket
  , ReconnectOptions
  , ReconnectPolicy
  , BackoffError(..)
  , reconnectPolicy
  , defaultReconnectOptions
  , connectWith
  ) where

import Prelude

import Data.Foldable (for_)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Number (isFinite)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Effect.Exception (Error, message, try)
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.Host (host)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (EventSource, SignalSource, batch, eventSource, signalSource)
import Screamer.Web.Page as Page

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

-- | Close details supplied by the browser, including application close codes.
type CloseInfo = { code :: Int, reason :: String, wasClean :: Boolean }

-- | Attempt zero is the initial connection. Retries count consecutive failed
-- | attempts, resetting after an open. `nextAt` uses the context Host's clock.
data ReconnectState
  = ConnectingAttempt Int
  | Connected
  | Reconnecting { attempt :: Int, nextAt :: Number, close :: CloseInfo }
  | Disconnected CloseInfo
  | ConnectionFailed Error

instance Show ReconnectState where
  show = case _ of
    ConnectingAttempt n -> "ConnectingAttempt " <> show n
    Connected -> "Connected"
    Reconnecting r -> "Reconnecting " <> show r
    Disconnected info -> "Disconnected " <> show info
    ConnectionFailed err -> "ConnectionFailed " <> message err

-- | A stable socket across attempts. Sends while disconnected/connecting are
-- | dropped, never replayed. Use `opened` to resend application subscriptions.
type ReconnectingSocket =
  { state :: Signal ReconnectState
  , messages :: Event String
  , opened :: Event Unit
  , send :: String -> Effect Unit
  }

-- | Validated exponential backoff; construct with `reconnectPolicy`.
newtype ReconnectPolicy = ReconnectPolicy { initial :: Number, max :: Number }

data BackoffError = NonFiniteDelay | NonPositiveDelay | MaximumBeforeInitial

derive instance Eq BackoffError

instance Show BackoffError where
  show = case _ of
    NonFiniteDelay -> "NonFiniteDelay"
    NonPositiveDelay -> "NonPositiveDelay"
    MaximumBeforeInitial -> "MaximumBeforeInitial"

-- | Delays must be finite, positive, and max must be at least initial.
reconnectPolicy :: Milliseconds -> Milliseconds -> Either BackoffError ReconnectPolicy
reconnectPolicy (Milliseconds initial) (Milliseconds max)
  | not (isFinite initial && isFinite max) = Left NonFiniteDelay
  | initial <= 0.0 || max <= 0.0 = Left NonPositiveDelay
  | max < initial = Left MaximumBeforeInitial
  | otherwise = Right (ReconnectPolicy { initial, max })

type ReconnectOptions =
  { reconnect :: Maybe ReconnectPolicy
  , retryOnOnline :: Boolean
  , shouldReconnect :: CloseInfo -> Boolean
  }

-- | Retry abnormal closes after 1s, doubling to 30s. Normal closure (1000)
-- | stops. Online/visible transitions accelerate an already pending retry.
defaultReconnectOptions :: ReconnectOptions
defaultReconnectOptions =
  { reconnect: Just (ReconnectPolicy { initial: 1000.0, max: 30000.0 })
  , retryOnOnline: true
  , shouldReconnect: \info -> info.code /= 1000
  }

foreign import data ManagedSocket :: Type

foreign import openManaged
  :: { url :: String
     , onOpen :: Effect Unit
     , onClose :: CloseInfo -> Effect Unit
     , onMessage :: String -> Effect Unit
     }
  -> Effect ManagedSocket

foreign import sendManaged :: ManagedSocket -> String -> Effect Unit
foreign import disposeManaged :: ManagedSocket -> Effect Unit

-- | Reconnect under the owning scope using its Host for all backoff timers.
-- | `Nothing` disables retries; `shouldReconnect` can stop on server codes.
-- | Constructor errors are terminal `ConnectionFailed` values. An obsolete
-- | or disposed attempt cannot publish. On a non-interactive renderer no
-- | browser resources are acquired and state stays `ConnectingAttempt 0`.
connectWith :: ReconnectOptions -> String -> Owned ReconnectingSocket
connectWith options url = do
  live <- interactive
  h <- host
  state <- liftEffect $ signalSource (ConnectingAttempt 0)
  messages <- liftEffect eventSource
  opened <- liftEffect eventSource
  socket <- liftEffect $ Ref.new Nothing
  disposed <- liftEffect $ Ref.new false
  generation <- liftEffect $ Ref.new 0
  phase <- liftEffect $ Ref.new (ConnectingAttempt 0)
  attempt <- liftEffect $ Ref.new 0
  let
    initial = case options.reconnect of
      Just (ReconnectPolicy p) -> p.initial
      Nothing -> 0.0
  delay <- liftEffect $ Ref.new initial
  cancel <- liftEffect $ Ref.new (pure unit)
  let
    publish value = Ref.write value phase *> state.putT1 value
    cancelTimer = do
      stop <- Ref.read cancel
      Ref.write (pure unit) cancel
      stop
    releaseSocket = do
      old <- Ref.read socket
      Ref.write Nothing socket
      for_ old disposeManaged
    current token action = do
      dead <- Ref.read disposed
      latest <- Ref.read generation
      unless (dead || token /= latest) action
    start n = do
      cancelTimer
      releaseSocket
      token <- Ref.modify (_ + 1) generation
      publish (ConnectingAttempt n)
      result <- try $ openManaged
        { url
        , onOpen: batch $ current token do
            Ref.write 0 attempt
            Ref.write initial delay
            publish Connected
            opened.fireT1 unit
        , onMessage: \text -> batch $ current token $ messages.fireT1 text
        , onClose: \info -> batch $ current token do
            -- Invalidate callbacks before releasing the browser handle.
            nextToken <- Ref.modify (_ + 1) generation
            releaseSocket
            case options.reconnect of
              Just (ReconnectPolicy p) | options.shouldReconnect info -> do
                n' <- Ref.modify (\a -> min 2147483646 a + 1) attempt
                wait <- Ref.read delay
                Ref.write (min p.max (wait * 2.0)) delay
                now <- h.now
                publish (Reconnecting { attempt: n', nextAt: now + wait, close: info })
                stop <- h.setTimeout wait (batch $ current nextToken wake)
                Ref.write stop cancel
              _ -> publish (Disconnected info)
        }
      case result of
        Left err -> publish (ConnectionFailed err)
        Right ws -> Ref.write (Just ws) socket
    -- The ref is advanced before publication, so simultaneous online and
    -- visibility occurrences cannot start two attempts in one timestep.
    wake = do
      dead <- Ref.read disposed
      unless dead $ Ref.read phase >>= case _ of
        Reconnecting r -> start r.attempt
        _ -> pure unit
    send text = do
      dead <- Ref.read disposed
      unless dead $ Ref.read socket >>= \ws -> for_ ws (\w -> sendManaged w text)
  onCleanup do
    Ref.write true disposed
    cancelTimer
    releaseSocket
  when live do
    liftEffect $ batch $ start 0
    case options.reconnect of
      Just _ | options.retryOnOnline -> do
        online <- Page.online
        visible <- Page.visible
        Event.subscribe (Event.oneOf [ Event.changes online, Event.changes visible ]) \ready ->
          when ready (batch wake)
      _ -> pure unit
  pure { state: state.signal, messages: messages.event, opened: opened.event, send }
