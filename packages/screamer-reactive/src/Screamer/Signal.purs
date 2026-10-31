-- | Signals: time-varying values. A `Signal` is a description of a node
-- | in the reactive graph. The derived signals are pure: allocating one has
-- | no effect on the graph until something observes it.
-- |
-- | A signal says what is true now; an `Event` says what happened. To
-- | accumulate, fold over an event: `Event.fold f seed (Event.changes s)`.
-- |
-- | A signal is, at each round, a value and whether it updated in that
-- | round. Both are part of its meaning (#68):
-- |
-- | - A signal source updates when it is written a value different from its
-- |   current one. This is the only place values are compared for free.
-- | - `pure x` never updates.
-- | - Derived signals update whenever an argument does, whatever value they
-- |   compute: `map f a` when `a` does, `apply` and `sampleManyWith`'s
-- |   tracked fields when either side does, `sampleOn a b` when `a` does,
-- |   `a >>= k` when `a` or the current inner signal does, and `attempt` and
-- |   `catching` when the argument does. So no function can hide an update,
-- |   and `Event.changes (f <$> s) = f <$> Event.changes s`.
-- | - To stop updates that repeat a value, use `dropRepeats`. It remembers
-- |   the value it showed, so it is stateful.
-- |
-- | Derived signals are cached while observed and recomputed on demand
-- | otherwise.
-- |
-- | Stateful signals remember something about the past, so they are made in
-- | `Owned`: `merge`, `latestWhere`, `gate`, `withPrevious`, `dropRepeats`,
-- | `dropRepeatsBy`, `dropRepeatsOn`, and `Event.stepper`, `Event.fold` and
-- | `Screamer.Signal.Extra.history`. Each call makes a new node:
-- |
-- | - Start. State begins when the `Owned` action runs, at the seed (for
-- |   `merge`, the left argument's current value).
-- | - Step. One step per round in which an argument updated. Writes inside
-- |   one batch coalesce, so two writes in one handler step a node once.
-- | - Lifetime. The node belongs to the current scope and steps for the
-- |   scope's whole life, whether or not anything reads it, until the scope
-- |   is disposed.
-- | - Simultaneity. When both arguments of `merge` update in one batch, the
-- |   left wins.
-- |
-- | Since state starts when it is created, and not when someone subscribes,
-- | a stateful signal shows the same values to every subscriber, and a pure
-- | function `a -> Signal b` can only refer to state that already exists.
module Screamer.Signal
  ( Signal
  , sampleOn
  , sampleMany
  , sampleManyWith
  , dropRepeats
  , dropRepeatsBy
  , dropRepeatsOn
  , withPrevious
  , catching
  , attempt
  , merge
  , latestWhere
  , gate
  , readT0
  , subscribe
  , hold
  , class SignalRecord
  , class UnsignalRecord
  , class SignalRowList
  ) where

import Prelude

import Data.Either (Either(..), either)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Exception (Error)
import Prim.Row (class Nub, class Union)
import Screamer.Owned (Owned(..), Scope)
import Prim.RowList (RowList, class RowToList, Cons, Nil)
import Type.RowList (class ListToRow)

foreign import data Signal :: Type -> Type

foreign import mapImpl :: forall a b. (a -> b) -> Signal a -> Signal b

foreign import applyImpl :: forall a b. Signal (a -> b) -> Signal a -> Signal b

foreign import pureImpl :: forall a. a -> Signal a

foreign import bindImpl :: forall a b. Signal a -> (a -> Signal b) -> Signal b

instance Functor Signal where
  map = mapImpl

instance Apply Signal where
  apply = applyImpl

instance Applicative Signal where
  pure = pureImpl

-- | Dynamic dependencies: the inner signal is rebuilt only when the outer
-- | signal updates, and the branch no longer read is released. The result
-- | updates when the outer signal or the current inner one does.
instance Bind Signal where
  bind = bindImpl

instance Monad Signal

-- | Lifted: `a <> b` is `append <$> a <*> b`.
instance Semigroup a => Semigroup (Signal a) where
  append a b = append <$> a <*> b

instance Monoid a => Monoid (Signal a) where
  mempty = pure mempty

-- | The current value of the second signal, updating whenever the first
-- | updates.
foreign import sampleOn :: forall a b. Signal a -> Signal b -> Signal b

-- | Update only when the argument updates to a value not equal to the one
-- | shown. Stateful, since it remembers that value. Use it before `dyn`,
-- | `resource`, `Event.changes` and anything else that reacts to updates
-- | rather than values, when the argument can update without changing:
-- |
-- | ```purescript
-- | page <- dropRepeats (_.page <$> state)
-- | pure (dyn (view <$> page))
-- | ```
dropRepeats :: forall a. Eq a => Signal a -> Owned (Signal a)
dropRepeats = dropRepeatsBy eq

-- | Update only when the argument updates to a value not equivalent to the
-- | one shown. Stateful: with an equivalence coarser than equality, it keeps
-- | showing the first value of each run of equivalent ones.
dropRepeatsBy :: forall a. (a -> a -> Boolean) -> Signal a -> Owned (Signal a)
dropRepeatsBy eq s = owned (newDropRepeatsBy eq s)

foreign import newDropRepeatsBy :: forall a. (a -> a -> Boolean) -> Signal a -> Effect (Signal a)

-- | Propagate a change only when the key of the new value differs from the
-- | key of the one shown. Stateful, like `dropRepeatsBy`.
dropRepeatsOn :: forall a k. Eq k => (a -> k) -> Signal a -> Owned (Signal a)
dropRepeatsOn key = dropRepeatsBy \x y -> key x == key y

-- | The previous value and the current one. It starts as the seed and the
-- | current value, and on each update pairs the value before it with the new
-- | one. Stateful.
withPrevious :: forall a. a -> Signal a -> Owned (Signal (Tuple a a))
withPrevious seed s = owned (withPreviousImpl Tuple seed s)

foreign import withPreviousImpl :: forall a. (a -> a -> Tuple a a) -> a -> Signal a -> Effect (Signal (Tuple a a))

-- | Recover from a derivation that throws: the handler's value while the
-- | signal's computation fails, and the signal's value again once it
-- | succeeds. The failing node stays consistent: it recomputes when its
-- | inputs change, and its next successful computation clears the error.
catching :: forall a. (Error -> a) -> Signal a -> Signal a
catching handler s = map (either handler identity) (attempt s)

-- | `Right` the signal's value, or `Left` the error its computation throws.
attempt :: forall a. Signal a -> Signal (Either Error a)
attempt = attemptImpl Left Right

foreign import attemptImpl :: forall a. (Error -> Either Error a) -> (a -> Either Error a) -> Signal a -> Signal (Either Error a)

-- | The latest of two signals, starting at the left one. It updates when
-- | either argument does, with the value of the one that did; the left wins
-- | ties. Stateful: it remembers which argument updated last.
merge :: forall a. Signal a -> Signal a -> Owned (Signal a)
merge a b = owned (mergeImpl a b)

foreign import mergeImpl :: forall a. Signal a -> Signal a -> Effect (Signal a)

-- | The latest value that satisfies the predicate, starting at the seed
-- | unless the argument satisfies it at the start. It updates when the
-- | argument updates to a value that passes. Stateful. (`Event.filter`
-- | keeps occurrences; a signal always has a value, so this one keeps the
-- | last that passed.)
latestWhere :: forall a. (a -> Boolean) -> a -> Signal a -> Owned (Signal a)
latestWhere p seed s = owned (latestWhereImpl p seed s)

foreign import latestWhereImpl :: forall a. (a -> Boolean) -> a -> Signal a -> Effect (Signal a)

-- | Follows the signal while the condition is true and keeps its last value
-- | while it is false; when the condition becomes true it takes the signal's
-- | current value. Starts at the seed unless the condition holds at the
-- | start. It updates when either argument updates and the condition is then
-- | true. Stateful. The signal counterpart of `Event.gate`.
gate :: forall a. Signal Boolean -> a -> Signal a -> Owned (Signal a)
gate cond seed s = owned (gateImpl cond seed s)

foreign import gateImpl :: forall a. Signal Boolean -> a -> Signal a -> Effect (Signal a)

-- | The current value, without recording a dependency.
foreign import readT0 :: forall a. Signal a -> Effect a

foreign import subscribeImpl :: forall a. Scope -> Signal a -> (a -> Effect Unit) -> Effect Unit

-- | Call the function with the signal's value now and whenever it updates,
-- | until the current scope is disposed. The callback runs untracked; writes
-- | it makes are deferred to the start of the next timestep, so every
-- | subscriber in a timestep sees the same values, and a `readT0` right after
-- | a write still returns the value the timestep started with. Of several
-- | writes to one source made in one timestep, the last made is the one
-- | applied; `modifyT1` applies its function to the result of the earlier
-- | ones. The callback never runs re-entrantly.
subscribe :: forall a. Signal a -> (a -> Effect Unit) -> Owned Unit
subscribe sig cb = Owned \s -> subscribeImpl s sig cb

foreign import holdImpl :: forall a. Scope -> Signal a -> Effect (Signal a)

-- | Observe a signal for the lifetime of the current scope, so it is kept
-- | computed whether or not anything else reads it. Returns the same signal.
-- | The signal counterpart of `Event.hold`.
hold :: forall a. Signal a -> Owned (Signal a)
hold sig = Owned \s -> holdImpl s sig

-- Make a stateful signal and hold it for the lifetime of the current scope,
-- so its state starts now. An add-on does the same with `hold`.
owned :: forall a. Effect (Signal a) -> Owned (Signal a)
owned make = liftEffect make >>= hold

-- | Forward evidence that a record `sa` has the same fields and types as the
-- | record `a`, except that each field in `sa` is wrapped in a `Signal`.
class SignalRecord (a :: Row Type) (sa :: Row Type) | a -> sa

instance
  ( RowToList a rla
  , ListToRow srla sa
  , SignalRowList rla srla
  ) =>
  SignalRecord a sa

-- | Backward evidence.
class UnsignalRecord (sa :: Row Type) (a :: Row Type) | sa -> a

instance
  ( RowToList sa srla
  , SignalRowList rla srla
  , ListToRow rla a
  ) =>
  UnsignalRecord sa a

-- | Bidirectional evidence.
class SignalRowList (rla :: RowList Type) (srla :: RowList Type) | rla -> srla, srla -> rla

instance SignalRowList t st => SignalRowList (Cons s f t) (Cons s (Signal f) st)

instance SignalRowList Nil Nil

-- | Sample the fields of the first record and track the fields of the
-- | second, combining them into one record.
sampleMany
  :: forall a sa b sb ab
   . UnsignalRecord sa a
  => UnsignalRecord sb b
  => Union a b ab
  => Nub ab ab
  => Record sa
  -> Record sb
  -> Signal (Record ab)
sampleMany a b = sampleManyWithImpl a b identity

-- | `sampleMany` followed by a function: the result updates when a field of
-- | the second record updates, using the current values of the first's.
sampleManyWith
  :: forall sa a sb b ab c
   . UnsignalRecord sa a
  => UnsignalRecord sb b
  => Union a b ab
  => Nub ab ab
  => Record sa
  -> Record sb
  -> (Record ab -> c)
  -> Signal c
sampleManyWith = sampleManyWithImpl

foreign import sampleManyWithImpl :: forall sa sb ab c. Record sa -> Record sb -> (Record ab -> c) -> Signal c
