-- | Rate-limiting and scheduling for events. Each combinator needs a timer,
-- | so each returns `Owned`: its timers start when its scope runs and are
-- | cancelled when the scope is disposed, and a pending occurrence is then
-- | dropped.
-- |
-- | Each combinator subscribes to its input when it is instantiated, so it
-- | observes the input for the whole life of its scope, whether or not
-- | anything observes its output. Occurrences it fires from a timer are
-- | delivered in one round per timer callback. Occurrences it passes on
-- | without a timer (a leading throttle edge, a timeout's `Right`) are fired
-- | from a subscription, so they arrive in the round after the input's.
module Screamer.Time
  ( debounce
  , debounced
  , throttle
  , audit
  , sampleEvery
  , delay
  , timeout
  , onFrame
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Array as Array
import Data.Foldable (for_, sequence_, traverse_)
import Data.Maybe (Maybe(..), isJust)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.EventSource (eventSource)
import Screamer.Owned (Owned, hold, onCleanup)
import Screamer.Signal (Signal, read)
import Screamer.SignalSource (signalSource)

foreign import timeoutImpl :: Number -> Effect Unit -> Effect (Effect Unit)

foreign import intervalImpl :: Number -> Effect Unit -> Effect (Effect Unit)

foreign import frameImpl :: Effect Unit -> Effect (Effect Unit)

-- | A single timer slot: starting it cancels the previous one.
type Slot = { start :: Effect (Effect Unit) -> Effect Unit, cancel :: Effect Unit, busy :: Effect Boolean }

slot :: Owned Slot
slot = do
  current <- liftEffect $ Ref.new Nothing
  let
    cancel = Ref.read current >>= \c -> do
      Ref.write Nothing current
      sequence_ c
    start schedule = do
      cancel
      c <- schedule
      Ref.write (Just c) current
  onCleanup cancel
  pure { start, cancel, busy: isJust <$> Ref.read current }

-- | The last occurrence of each burst, once the input has been quiet for
-- | the interval. (RxJS `debounceTime`.)
debounce :: forall a. Milliseconds -> Event a -> Owned (Event a)
debounce (Milliseconds ms) input = do
  out <- liftEffect eventSource
  timer <- slot
  Event.subscribe input \a -> timer.start (timeoutImpl ms (timerDone timer *> out.fire a))
  pure out.event

-- | The signal's value once it has stopped changing for the interval. It
-- | starts at the signal's current value.
debounced :: forall a. Milliseconds -> Signal a -> Owned (Signal a)
debounced ms input = do
  out <- liftEffect $ signalSource =<< read input
  settled <- debounce ms (Event.changes input)
  Event.subscribe settled out.put
  pure out.signal

-- | At most one occurrence per interval. With `leading`, the first
-- | occurrence of a burst passes and opens the interval; with `trailing`,
-- | the last occurrence during the interval is fired when it ends, and opens
-- | a new one. (RxJS `throttleTime`.)
throttle :: forall a. { leading :: Boolean, trailing :: Boolean } -> Milliseconds -> Event a -> Owned (Event a)
throttle { leading, trailing } (Milliseconds ms) input = do
  out <- liftEffect eventSource
  timer <- slot
  pending <- liftEffect $ Ref.new Nothing
  let
    open _ = timer.start (timeoutImpl ms (close unit))
    close _ = do
      timerDone timer
      Ref.modify' (\p -> { state: Nothing, value: p }) pending >>= case _ of
        Just a | trailing -> out.fire a *> open unit
        _ -> pure unit
  Event.subscribe input \a -> do
    inWindow <- timer.busy
    if inWindow then
      when trailing $ Ref.write (Just a) pending
    else do
      if leading then out.fire a else Ref.write (Just a) pending
      open unit
  pure out.event

-- | After an occurrence, wait for the interval, then fire the latest
-- | occurrence seen meanwhile. (RxJS `auditTime`.)
audit :: forall a. Milliseconds -> Event a -> Owned (Event a)
audit (Milliseconds ms) input = do
  out <- liftEffect eventSource
  timer <- slot
  latest <- liftEffect $ Ref.new Nothing
  Event.subscribe input \a -> do
    Ref.write (Just a) latest
    waiting <- timer.busy
    unless waiting $ timer.start $ timeoutImpl ms do
      timerDone timer
      Ref.modify' (\l -> { state: Nothing, value: l }) latest >>= traverse_ out.fire
  pure out.event

-- | The signal's value at every interval, starting one interval from now.
-- | The signal is held, so a stateful signal keeps advancing. (RxJS
-- | `sampleTime`, built like `Timer.every`.)
sampleEvery :: forall a. Milliseconds -> Signal a -> Owned (Event a)
sampleEvery (Milliseconds ms) input = do
  out <- liftEffect eventSource
  _ <- hold input
  cancel <- liftEffect $ intervalImpl ms (out.fire =<< read input)
  onCleanup cancel
  pure out.event

-- | Every occurrence, the interval later, in order. (RxJS `delay`.)
delay :: forall a. Milliseconds -> Event a -> Owned (Event a)
delay (Milliseconds ms) input = do
  out <- liftEffect eventSource
  -- Pending timers by id, so each can be forgotten when it fires.
  pending <- liftEffect $ Ref.new ([] :: Array { id :: Int, cancel :: Effect Unit })
  next <- liftEffect $ Ref.new 0
  Event.subscribe input \a -> do
    id <- Ref.modify' (\i -> { state: i + 1, value: i }) next
    cancel <- timeoutImpl ms do
      Ref.modify_ (Array.filter ((_ /= id) <<< _.id)) pending
      out.fire a
    Ref.modify_ (_ <> [ { id, cancel } ]) pending
  onCleanup do
    ps <- Ref.modify' (\ps -> { state: [], value: ps }) pending
    for_ ps _.cancel
  pure out.event

-- | Every occurrence as `Right`, and a `Left unit` whenever the interval
-- | passes with no occurrence: from instantiation, and after each
-- | occurrence. After a `Left`, the next one waits for another occurrence.
-- | (RxJS `timeout`, which errors instead.)
timeout :: forall a. Milliseconds -> Event a -> Owned (Event (Either Unit a))
timeout (Milliseconds ms) input = do
  out <- liftEffect eventSource
  timer <- slot
  let arm = timer.start (timeoutImpl ms (timerDone timer *> out.fire (Left unit)))
  liftEffect arm
  Event.subscribe input \a -> do
    out.fire (Right a)
    arm
  pure out.event

-- | The latest occurrence, on the next animation frame. Several occurrences
-- | before a frame make one.
onFrame :: forall a. Event a -> Owned (Event a)
onFrame input = do
  out <- liftEffect eventSource
  timer <- slot
  latest <- liftEffect $ Ref.new Nothing
  Event.subscribe input \a -> do
    Ref.write (Just a) latest
    waiting <- timer.busy
    unless waiting $ timer.start $ frameImpl do
      timerDone timer
      Ref.modify' (\l -> { state: Nothing, value: l }) latest >>= traverse_ out.fire
  pure out.event

-- | Mark the slot's timer as having run, so `busy` turns false.
timerDone :: Slot -> Effect Unit
timerDone = _.cancel
