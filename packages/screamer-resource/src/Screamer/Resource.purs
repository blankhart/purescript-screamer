-- | Asynchronous values that follow a signal.
module Screamer.Resource
  ( Remote(..)
  , Strategy(..)
  , resource
  , resourceWith
  , request
  , withDefault
  , toMaybe
  , isLoading
  , keepLast
  , Backoff(..)
  , RetryPolicy
  , retry
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Aff (Aff, Fiber, attempt, effectCanceler, error, killFiber, launchAff, launchAff_, makeAff, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (Error, message)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.Host (Host, host)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Pending (pendingIn)
import Screamer.Signal (Signal, subscribe)
import Screamer.Signal as Signal
import Screamer.Source (eventSource, signalSource)

data Remote b = Loading | Failed Error | Loaded b

instance Eq b => Eq (Remote b) where
  eq Loading Loading = true
  eq (Failed a) (Failed b) = message a == message b
  eq (Loaded a) (Loaded b) = a == b
  eq _ _ = false

instance Show b => Show (Remote b) where
  show = case _ of
    Loading -> "Loading"
    Failed e -> "(Failed " <> show (message e) <> ")"
    Loaded b -> "(Loaded " <> show b <> ")"

instance Functor Remote where
  map f = case _ of
    Loading -> Loading
    Failed e -> Failed e
    Loaded b -> Loaded (f b)

-- | Combine several resources: `Failed` if any failed (the leftmost
-- | failure wins), else `Loading` if any is loading, else `Loaded`.
instance Apply Remote where
  apply (Failed e) _ = Failed e
  apply _ (Failed e) = Failed e
  apply (Loaded f) (Loaded a) = Loaded (f a)
  apply _ _ = Loading

instance Applicative Remote where
  pure = Loaded

-- | The loaded value, or the default.
withDefault :: forall a. a -> Remote a -> a
withDefault d = case _ of
  Loaded a -> a
  _ -> d

toMaybe :: forall a. Remote a -> Maybe a
toMaybe = case _ of
  Loaded a -> Just a
  _ -> Nothing

isLoading :: forall a. Remote a -> Boolean
isLoading = case _ of
  Loading -> true
  _ -> false

-- | Keep showing the last `Loaded` value while a new request loads, so a
-- | list does not flash empty on every keystroke. `Failed` and new `Loaded`
-- | values pass through; `Loading` shows only before anything has loaded.
-- | Stateful: it starts from the argument's current value when the `Owned`
-- | action runs.
keepLast :: forall a. Signal (Remote a) -> Owned (Signal (Remote a))
keepLast s = liftEffect (keepLastImpl isLoading isLoaded s) >>= Signal.hold
  where
  isLoaded = case _ of
    Loaded _ -> true
    _ -> false

foreign import keepLastImpl :: forall a. (Remote a -> Boolean) -> (Remote a -> Boolean) -> Signal (Remote a) -> Effect (Signal (Remote a))

-- | How long to wait before each retry.
-- |
-- | - `Immediately`: no wait.
-- | - `Fixed d`: d before every retry.
-- | - `Exponential { initial, max }`: initial before the first retry,
-- |   doubling each time, never more than max.
data Backoff
  = Immediately
  | Fixed Milliseconds
  | Exponential { initial :: Milliseconds, max :: Milliseconds }

-- | Retry a failed request up to `retries` times, waiting as the backoff
-- | says before each retry.
type RetryPolicy = { retries :: Int, backoff :: Backoff }

-- | Run the request, and retry it on failure under the policy; the last
-- | failure is rethrown. The waits use the scope's `Screamer.Host` timers,
-- | and killing the request (a new input under `Switch`, or disposing the
-- | scope) cancels a pending retry. Pass the result to `resourceWith` or
-- | `request`.
retry :: forall a b. RetryPolicy -> (a -> Aff b) -> Owned (a -> Aff b)
retry policy req = host <#> \h a ->
  let
    go n = attempt (req a) >>= case _ of
      Right b -> pure b
      Left e
        | n < policy.retries -> wait h n *> go (n + 1)
        | otherwise -> throwError e
  in
    go 0
  where
  wait h n = case policy.backoff of
    Immediately -> pure unit
    Fixed d -> sleep h d
    Exponential { initial: Milliseconds i, max: Milliseconds m } ->
      sleep h (Milliseconds (min m (i * pow2 n)))
  pow2 n = if n <= 0 then 1.0 else 2.0 * pow2 (n - 1)

-- | Wait on the host's timer; killing the fiber cancels it.
sleep :: Host -> Milliseconds -> Aff Unit
sleep h (Milliseconds ms) = makeAff \k -> do
  cancel <- h.setTimeout ms (k (Right unit))
  pure (effectCanceler cancel)

-- | Choose how overlapping requests run:
-- |
-- | - `Switch`: a new input kills the running request, whose
-- |   result is never shown.
-- | - `Merge`: every request runs; each result is shown when it
-- |   arrives.
-- | - `Concat`: inputs queue while a request runs, without
-- |   bound, and run in order.
-- | - `Exhaust`: inputs that arrive while a request runs are
-- |   ignored.
data Strategy = Switch | Merge | Concat | Exhaust

derive instance Eq Strategy

instance Show Strategy where
  show = case _ of
    Switch -> "Switch"
    Merge -> "Merge"
    Concat -> "Concat"
    Exhaust -> "Exhaust"

-- | Run the request for the input's current value, and again whenever the
-- | input updates. The signal is `Loading` while a request runs. A request
-- | still running when the input updates, or when the scope is disposed, is
-- | killed, and its result is never shown. `resourceWith Switch`.
-- |
-- | A derived input updates whenever its own arguments do, even when its
-- | value stays the same, so pass it through `Signal.dropRepeats` first to
-- | request only when the value changes:
-- |
-- | ```purescript
-- | query <- Signal.dropRepeats (_.query <$> state)
-- | results <- resource query search
-- | ```
resource :: forall a b. Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))
resource = resourceWith Switch

-- | `resource` under a strategy. The signal turns `Loading` when a request
-- | starts and shows each result the strategy keeps. Under `Exhaust` the
-- | result can be for an older input than the signal's current value. A
-- | request still running when the scope is disposed is killed.
-- |
-- | To retry failed requests, pass the request `Screamer.Resource.retry`
-- | returns; its delays are killed with the request.
-- |
-- | Each running request is registered with `Screamer.Pending`, so
-- | `settled` is false while it runs.
resourceWith :: forall a b. Strategy -> Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))
resourceWith strategy input req = do
  result <- liftEffect $ signalSource Loading
  run <- runner strategy req
    { started: result.putT1 Loading
    , settled: \outcome -> result.putT1 case outcome of
        Left e -> Failed e
        Right b -> Loaded b
    }
  subscribe input run
  pure result.signal

-- | Run the request for each occurrence, under a strategy, with one
-- | occurrence per result kept. Requests still running when the scope is
-- | disposed are killed. Each running request is registered with
-- | `Screamer.Pending`.
request :: forall a b. Strategy -> Event a -> (a -> Aff b) -> Owned (Event (Either Error b))
request strategy input req = do
  results <- liftEffect eventSource
  run <- runner strategy req { started: pure unit, settled: results.fireT1 }
  Event.subscribe input run
  pure results.event

-- | Start or queue requests under the strategy, until the scope is disposed.
runner
  :: forall a b
   . Strategy
  -> (a -> Aff b)
  -> { started :: Effect Unit, settled :: Either Error b -> Effect Unit }
  -> Owned (a -> Effect Unit)
runner strategy req on = do
  register <- pendingIn
  -- Requests whose results are still wanted, their fibers once known, and
  -- the `done` of each one's pending work.
  live <- liftEffect $ Ref.new ([] :: Array Int)
  fibers <- liftEffect $ Ref.new ([] :: Array { id :: Int, fiber :: Fiber Unit })
  dones <- liftEffect $ Ref.new ([] :: Array { id :: Int, done :: Effect Unit })
  queue <- liftEffect $ Ref.new ([] :: Array a)
  nextId <- liftEffect $ Ref.new 0
  let
    isLive id = Array.elem id <$> Ref.read live
    forget id = do
      Ref.modify_ (Array.delete id) live
      Ref.modify_ (Array.filter ((_ /= id) <<< _.id)) fibers
    doneWith id = do
      ds <- Ref.modify' (\ds -> { state: Array.filter ((_ /= id) <<< _.id) ds, value: ds }) dones
      for_ ds \d -> when (d.id == id) d.done
    killAll = do
      Ref.write [] live
      running <- Ref.modify' (\fs -> { state: [], value: fs }) fibers
      for_ running \f -> launchAff_ (killFiber (error "request cancelled") f.fiber)
      ds <- Ref.modify' (\ds -> { state: [], value: ds }) dones
      for_ ds _.done
    launch a = do
      id <- Ref.modify' (\i -> { state: i + 1, value: i }) nextId
      Ref.modify_ (_ <> [ id ]) live
      done <- register
      Ref.modify_ (_ <> [ { id, done } ]) dones
      on.started
      fiber <- launchAff do
        outcome <- attempt (req a)
        liftEffect (finish id outcome)
      -- A request that settled synchronously has nothing left to kill.
      stillRunning <- isLive id
      when stillRunning $ Ref.modify_ (_ <> [ { id, fiber } ]) fibers
    finish id outcome = do
      wanted <- isLive id
      when wanted do
        forget id
        on.settled outcome
        doneWith id
        Ref.modify' (\q -> { state: Array.drop 1 q, value: Array.head q }) queue >>= case _ of
          Just a -> launch a
          Nothing -> pure unit
    busy = not <<< Array.null <$> Ref.read live
    run a = case strategy of
      Switch -> killAll *> launch a
      Merge -> launch a
      Concat -> busy >>= if _ then Ref.modify_ (_ <> [ a ]) queue else launch a
      Exhaust -> busy >>= if _ then pure unit else launch a
  onCleanup (Ref.write [] queue *> killAll)
  pure run
