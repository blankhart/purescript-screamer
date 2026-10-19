-- | Flattening with owned inner work: one child scope per inner value, like
-- | `dyn` but for values other than elements. A child owns whatever its
-- | setup creates (timers, sockets, subscriptions) and releases it when it
-- | is disposed.
-- |
-- | The four RxJS strategies:
-- |
-- | - `switchOwned` (`switchMap`): a new input disposes the running child.
-- | - `mergeOwned` (`mergeMap`): every child runs at once.
-- | - `concatOwned` (`concatMap`): inputs queue while a child runs, and
-- |   start in order.
-- | - `exhaustOwned` (`exhaustMap`): inputs are ignored while a child runs.
-- |
-- | For the event forms a child is running until it calls the `done` action
-- | it is given, which disposes it, or until the parent scope is disposed.
-- | For `Aff` requests, see `Screamer.Resource.resourceWith` and `request`,
-- | where a request runs until it settles.
module Screamer.Flatten
  ( switchOwned
  , mergeOwned
  , concatOwned
  , exhaustOwned
  ) where

import Prelude

import Effect (Effect)
import Screamer.Event (Event)
import Screamer.Owned (Owned(..), Scope)
import Screamer.Signal (Signal)

foreign import switchOwnedImpl :: forall a b. Scope -> Signal a -> (a -> Owned b) -> Effect (Signal b)

foreign import mergeOwnedImpl :: forall a b. Scope -> Event a -> (a -> Effect Unit -> Owned (Event b)) -> Effect (Event b)

foreign import concatOwnedImpl :: forall a b. Scope -> Event a -> (a -> Effect Unit -> Owned (Event b)) -> Effect (Event b)

foreign import exhaustOwnedImpl :: forall a b. Scope -> Event a -> (a -> Effect Unit -> Owned (Event b)) -> Effect (Event b)

-- | Run the setup for the signal's current value in a child scope, and again
-- | for each new value, disposing the previous child first. The result
-- | follows the latest child's value.
switchOwned :: forall a b. Signal a -> (a -> Owned b) -> Owned (Signal b)
switchOwned sig f = Owned \s -> switchOwnedImpl s sig f

-- | Run the setup in a new child scope for every occurrence, and merge the
-- | children's events. Each child runs until it calls `done` or the parent
-- | scope is disposed.
mergeOwned :: forall a b. Event a -> (a -> Effect Unit -> Owned (Event b)) -> Owned (Event b)
mergeOwned e f = Owned \s -> mergeOwnedImpl s e f

-- | Like `mergeOwned`, but one child at a time: occurrences that arrive
-- | while a child runs wait in a queue, without bound, and start in order.
concatOwned :: forall a b. Event a -> (a -> Effect Unit -> Owned (Event b)) -> Owned (Event b)
concatOwned e f = Owned \s -> concatOwnedImpl s e f

-- | Like `mergeOwned`, but one child at a time: occurrences that arrive
-- | while a child runs are ignored.
exhaustOwned :: forall a b. Event a -> (a -> Effect Unit -> Owned (Event b)) -> Owned (Event b)
exhaustOwned e f = Owned \s -> exhaustOwnedImpl s e f
