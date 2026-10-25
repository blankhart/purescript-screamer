-- | Time: timer and frame sources, and rate-limiting and scheduling for
-- | events. Each needs a timer, so each returns `Owned`: its timers start
-- | when its scope runs and are cancelled when the scope is disposed, and a
-- | pending occurrence is then dropped. Sources return a `Signal` for state
-- | (`clock`) or an `Event` for occurrences (`interval`, `after`, `frames`),
-- | never take a callback; every timer callback runs inside `batch`.
-- |
-- | Each reads the `Screamer.Host` of its scope once, when it is
-- | instantiated, for the clock, timers and frames.
-- |
-- | Each combinator subscribes to its input when it is instantiated, so it
-- | observes the input for the whole life of its scope, whether or not
-- | anything observes its output. Occurrences it fires from a timer are
-- | delivered in one round per timer callback. Occurrences it passes on
-- | without a timer (a leading throttle edge, a timeout's `Right`) are fired
-- | from a subscription, so they arrive in the round after the input's.
module Screamer.Time
  ( clock
  , interval
  , after
  , frames
  , debounce
  , debounceSignal
  , throttle
  , audit
  , sampleEvery
  , delay
  , timeout
  , onFrame
  , bufferFor
  ) where

import Prelude

import Data.Array as Array
import Data.DateTime.Instant (Instant, instant)
import Data.Either (Either(..))
import Data.Foldable (for_, sequence_, traverse_)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.Host (host)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal, hold, readT0)
import Screamer.Source (batch, eventSource, signalSource)

-- | The scope's host, with each callback run inside `batch`.
type Timers =
  { now :: Effect Number
  , timeout :: Number -> Effect Unit -> Effect (Effect Unit)
  , interval :: Number -> Effect Unit -> Effect (Effect Unit)
  , frame :: (Number -> Effect Unit) -> Effect (Effect Unit)
  }

timers :: Owned Timers
timers = host <#> \h ->
  { now: h.now
  , timeout: \ms action -> h.setTimeout ms (batch action)
  , interval: \ms action -> h.setInterval ms (batch action)
  , frame: \action -> h.requestFrame \t -> batch (action t)
  }

toInstant :: Number -> Instant
toInstant n = fromMaybe bottom (instant (Milliseconds n))

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

-- | The current time, starting now and updated every interval.
clock :: Milliseconds -> Owned (Signal Instant)
clock (Milliseconds ms) = do
  t <- timers
  time <- liftEffect $ signalSource <<< toInstant =<< t.now
  cancel <- liftEffect $ t.interval ms (time.putT1 <<< toInstant =<< t.now)
  onCleanup cancel
  pure time.signal

-- | One occurrence every interval, starting one interval from now.
interval :: Milliseconds -> Owned (Event Unit)
interval (Milliseconds ms) = do
  t <- timers
  out <- liftEffect eventSource
  cancel <- liftEffect $ t.interval ms (out.fireT1 unit)
  onCleanup cancel
  pure out.event

-- | One occurrence, the interval from now, unless the scope is disposed
-- | first.
after :: Milliseconds -> Owned (Event Unit)
after (Milliseconds ms) = do
  t <- timers
  out <- liftEffect eventSource
  cancel <- liftEffect $ t.timeout ms (out.fireT1 unit)
  onCleanup cancel
  pure out.event

-- | One occurrence per animation frame, carrying the frame's timestamp in
-- | milliseconds on the `performance.now()` clock.
frames :: Owned (Event Number)
frames = do
  t <- timers
  out <- liftEffect eventSource
  timer <- slot
  let
    loop _ = timer.start $ t.frame \ts -> do
      loop unit
      out.fireT1 ts
  liftEffect $ loop unit
  pure out.event

-- | The last occurrence of each burst, once the input has been quiet for
-- | the interval. (RxJS `debounceTime`.)
debounce :: forall a. Milliseconds -> Event a -> Owned (Event a)
debounce (Milliseconds ms) input = do
  t <- timers
  out <- liftEffect eventSource
  timer <- slot
  Event.subscribe input \a -> timer.start (t.timeout ms (timerDone timer *> out.fireT1 a))
  pure out.event

-- | The signal's value once it has stopped changing for the interval. It
-- | starts at the signal's current value. The signal counterpart of
-- | `debounce`.
debounceSignal :: forall a. Milliseconds -> Signal a -> Owned (Signal a)
debounceSignal ms input = do
  out <- liftEffect $ signalSource =<< readT0 input
  settled <- debounce ms (Event.changes input)
  Event.subscribe settled out.putT1
  pure out.signal

-- | At most one occurrence per interval. With `leading`, the first
-- | occurrence of a burst passes and opens the interval; with `trailing`,
-- | the last occurrence during the interval is fired when it ends, and opens
-- | a new one. (RxJS `throttleTime`.)
throttle :: forall a. { leading :: Boolean, trailing :: Boolean } -> Milliseconds -> Event a -> Owned (Event a)
throttle { leading, trailing } (Milliseconds ms) input = do
  t <- timers
  out <- liftEffect eventSource
  timer <- slot
  pending <- liftEffect $ Ref.new Nothing
  let
    open _ = timer.start (t.timeout ms (close unit))
    close _ = do
      timerDone timer
      Ref.modify' (\p -> { state: Nothing, value: p }) pending >>= case _ of
        Just a | trailing -> out.fireT1 a *> open unit
        _ -> pure unit
  Event.subscribe input \a -> do
    inWindow <- timer.busy
    if inWindow then
      when trailing $ Ref.write (Just a) pending
    else do
      if leading then out.fireT1 a else Ref.write (Just a) pending
      open unit
  pure out.event

-- | After an occurrence, wait for the interval, then fire the latest
-- | occurrence seen meanwhile. (RxJS `auditTime`.)
audit :: forall a. Milliseconds -> Event a -> Owned (Event a)
audit (Milliseconds ms) input = do
  t <- timers
  out <- liftEffect eventSource
  timer <- slot
  latest <- liftEffect $ Ref.new Nothing
  Event.subscribe input \a -> do
    Ref.write (Just a) latest
    waiting <- timer.busy
    unless waiting $ timer.start $ t.timeout ms do
      timerDone timer
      Ref.modify' (\l -> { state: Nothing, value: l }) latest >>= traverse_ out.fireT1
  pure out.event

-- | The signal's value at every interval, starting one interval from now.
-- | The signal is held, so it is kept computed between samples. (RxJS
-- | `sampleTime`, built like `clock`.)
sampleEvery :: forall a. Milliseconds -> Signal a -> Owned (Event a)
sampleEvery (Milliseconds ms) input = do
  t <- timers
  out <- liftEffect eventSource
  _ <- hold input
  cancel <- liftEffect $ t.interval ms (out.fireT1 =<< readT0 input)
  onCleanup cancel
  pure out.event

-- | Every occurrence, the interval later, in order. (RxJS `delay`.)
delay :: forall a. Milliseconds -> Event a -> Owned (Event a)
delay (Milliseconds ms) input = do
  t <- timers
  out <- liftEffect eventSource
  -- Pending timers by id, so each can be forgotten when it fires.
  pending <- liftEffect $ Ref.new ([] :: Array { id :: Int, cancel :: Effect Unit })
  next <- liftEffect $ Ref.new 0
  Event.subscribe input \a -> do
    id <- Ref.modify' (\i -> { state: i + 1, value: i }) next
    cancel <- t.timeout ms do
      Ref.modify_ (Array.filter ((_ /= id) <<< _.id)) pending
      out.fireT1 a
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
  t <- timers
  out <- liftEffect eventSource
  timer <- slot
  let arm = timer.start (t.timeout ms (timerDone timer *> out.fireT1 (Left unit)))
  liftEffect arm
  Event.subscribe input \a -> do
    out.fireT1 (Right a)
    arm
  pure out.event

-- | The latest occurrence, on the next animation frame. Several occurrences
-- | before a frame make one.
onFrame :: forall a. Event a -> Owned (Event a)
onFrame input = do
  t <- timers
  out <- liftEffect eventSource
  timer <- slot
  latest <- liftEffect $ Ref.new Nothing
  Event.subscribe input \a -> do
    Ref.write (Just a) latest
    waiting <- timer.busy
    unless waiting $ timer.start $ t.frame \_ -> do
      timerDone timer
      Ref.modify' (\l -> { state: Nothing, value: l }) latest >>= traverse_ out.fireT1
  pure out.event

-- | Mark the slot's timer as having run, so `busy` turns false.
timerDone :: Slot -> Effect Unit
timerDone = _.cancel

-- | The occurrences of each interval, fired at its end, starting one
-- | interval from now. An interval with no occurrences fires nothing,
-- | unlike RxJS. What is buffered when the scope is disposed is dropped.
-- | (RxJS `bufferTime`.)
bufferFor :: forall a. Milliseconds -> Event a -> Owned (Event (Array a))
bufferFor (Milliseconds ms) input = do
  t <- timers
  out <- liftEffect eventSource
  held <- liftEffect $ Ref.new []
  Event.subscribe input \a -> Ref.modify_ (_ <> [ a ]) held
  cancel <- liftEffect $ t.interval ms do
    xs <- Ref.modify' (\xs -> { state: [], value: xs }) held
    unless (Array.null xs) $ out.fireT1 xs
  onCleanup (cancel *> Ref.write [] held)
  pure out.event
