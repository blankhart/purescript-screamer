-- | Asynchronous values that follow a signal.
module Screamer.Resource
  ( Remote(..)
  , Strategy(..)
  , resource
  , resourceWith
  , request
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, Fiber, attempt, error, killFiber, launchAff, launchAff_)
import Effect.Class (liftEffect)
import Effect.Exception (Error, message)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.EventSource (eventSource)
import Screamer.Owned (Owned, onCleanup, subscribe)
import Screamer.Signal (Signal)
import Screamer.SignalSource (signalSource)

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

-- | How requests that overlap are run. The names are RxJS's flattening
-- | operators.
-- |
-- | - `Switch` (`switchMap`): a new input kills the running request, whose
-- |   result is never shown.
-- | - `Merge` (`mergeMap`): every request runs; each result is shown when it
-- |   arrives.
-- | - `Concat` (`concatMap`): inputs queue while a request runs, without
-- |   bound, and run in order.
-- | - `Exhaust` (`exhaustMap`): inputs that arrive while a request runs are
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
-- | input changes. The signal is `Loading` while a request runs. A request
-- | still running when the input changes, or when the scope is disposed, is
-- | killed, and its result is never shown. `resourceWith Switch`.
resource :: forall a b. Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))
resource = resourceWith Switch

-- | `resource` under a strategy. The signal turns `Loading` when a request
-- | starts and shows each result the strategy keeps. Under `Exhaust` the
-- | result can be for an older input than the signal's current value. A
-- | request still running when the scope is disposed is killed.
-- |
-- | To retry failed requests, pass `Screamer.Resource.retry policy request`
-- | as the request; its delays are killed with the request.
resourceWith :: forall a b. Strategy -> Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))
resourceWith strategy input req = do
  result <- liftEffect $ signalSource Loading
  run <- runner strategy req
    { started: result.put Loading
    , settled: \outcome -> result.put case outcome of
        Left e -> Failed e
        Right b -> Loaded b
    }
  subscribe input run
  pure result.signal

-- | Run the request for each occurrence, under a strategy, with one
-- | occurrence per result kept. Requests still running when the scope is
-- | disposed are killed.
request :: forall a b. Strategy -> Event a -> (a -> Aff b) -> Owned (Event (Either Error b))
request strategy input req = do
  results <- liftEffect eventSource
  run <- runner strategy req { started: pure unit, settled: results.fire }
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
  -- Requests whose results are still wanted, and their fibers once known.
  live <- liftEffect $ Ref.new ([] :: Array Int)
  fibers <- liftEffect $ Ref.new ([] :: Array { id :: Int, fiber :: Fiber Unit })
  queue <- liftEffect $ Ref.new ([] :: Array a)
  nextId <- liftEffect $ Ref.new 0
  let
    isLive id = Array.elem id <$> Ref.read live
    forget id = do
      Ref.modify_ (Array.delete id) live
      Ref.modify_ (Array.filter ((_ /= id) <<< _.id)) fibers
    killAll = do
      Ref.write [] live
      running <- Ref.modify' (\fs -> { state: [], value: fs }) fibers
      for_ running \f -> launchAff_ (killFiber (error "request cancelled") f.fiber)
    launch a = do
      id <- Ref.modify' (\i -> { state: i + 1, value: i }) nextId
      Ref.modify_ (_ <> [ id ]) live
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
