-- | Signals: time-varying values. Everything here is pure except `read`,
-- | `subscribe` and `hold`: a `Signal` is a description of a node in the
-- | reactive graph, and allocating one has no effect on the graph until
-- | something observes it.
-- |
-- | A signal says what is true now; an `Event` says what happened. To
-- | accumulate, fold over an event: `Event.fold f seed (Event.changes s)`.
-- |
-- | Derived signals (`map`, `apply`, `bind`, `sampleOn`, `sampleManyWith`,
-- | `dropRepeatsBy`) are cached while observed and recomputed on demand
-- | otherwise. A node propagates a change only when its value changes under
-- | its equality (`Object.is` by default, `Eq` through `dropRepeats`).
-- |
-- | Stateful signals (`merge`, `latestWhere`, `gate`, `withPrevious`,
-- | `history`) advance only while observed; they pause:
-- |
-- | - Start. State begins at the seed (for `merge`, the left input's current
-- |   value). Values the input held before observation are not stepped over.
-- | - Step. One step per propagation in which an input changed. Writes inside
-- |   one batch coalesce, so two writes in one handler step a node once.
-- | - Pause. When the last observer goes, the node unlinks and keeps its
-- |   state. `read` returns that state. When observed again it
-- |   resynchronizes with its inputs without stepping, then continues.
-- | - Simultaneity. When both inputs of `merge` change in one batch, the left
-- |   wins (like Reflex's `leftmost`).
-- |
-- | Two evaluations of the same stateful expression produce the same values
-- | whenever they are observed over the same interval. Use `hold` where a
-- | program needs one state regardless of who observes it.
module Screamer.Signal
  ( Signal
  , sampleOn
  , sampleMany
  , sampleManyWith
  , dropRepeats
  , dropRepeatsBy
  , dropRepeatsOn
  , withPrevious
  , combine
  , withLatest
  , switchLatest
  , history
  , catching
  , attempt
  , merge
  , latestWhere
  , gate
  , read
  , subscribe
  , hold
  , class SignalRecord
  , class UnsignalRecord
  , class SignalRowList
  ) where

import Prelude

import Control.Alt (class Alt)
import Data.Either (Either(..), either)
import Data.Tuple (Tuple(..))
import Effect (Effect)
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
-- | signal changes, and the branch no longer read is released.
instance Bind Signal where
  bind = bindImpl

instance Monad Signal

-- | `(<|>)` is `merge`: the latest of the two, the left winning ties.
instance Alt Signal where
  alt = merge

-- | Lifted: `a <> b` is `append <$> a <*> b`.
instance Semigroup a => Semigroup (Signal a) where
  append a b = append <$> a <*> b

instance Monoid a => Monoid (Signal a) where
  mempty = pure mempty

-- | The current value of the second signal whenever the first changes.
foreign import sampleOn :: forall a b. Signal a -> Signal b -> Signal b

-- | Propagate a change only when the new value is not equal to the old one.
dropRepeats :: forall a. Eq a => Signal a -> Signal a
dropRepeats = dropRepeatsByImpl eq

dropRepeatsBy :: forall a. (a -> a -> Boolean) -> Signal a -> Signal a
dropRepeatsBy = dropRepeatsByImpl

foreign import dropRepeatsByImpl :: forall a. (a -> a -> Boolean) -> Signal a -> Signal a

-- | Propagate a change only when the key of the new value differs from the
-- | key of the old one. (RxJS `distinctUntilKeyChanged`.)
dropRepeatsOn :: forall a k. Eq k => (a -> k) -> Signal a -> Signal a
dropRepeatsOn key = dropRepeatsByImpl \x y -> key x == key y

-- | The previous value and the current one. It starts as the seed and the
-- | current value, and on each change pairs the value before it with the new
-- | one. Stateful: it steps only while observed. (RxJS `pairwise`.)
withPrevious :: forall a. a -> Signal a -> Signal (Tuple a a)
withPrevious = withPreviousImpl Tuple

foreign import withPreviousImpl :: forall a. (a -> a -> Tuple a a) -> a -> Signal a -> Signal (Tuple a a)

-- | The current values of every signal in the array, as one node rather
-- | than a chain of `apply`s. (RxJS `combineLatest`.)
foreign import combine :: forall a. Array (Signal a) -> Signal (Array a)

-- | The second signal's value paired with the first's, changing only when
-- | the second changes. The first is observed with it, so a stateful signal
-- | there keeps advancing. (RxJS `withLatestFrom`.)
withLatest :: forall a b. Signal b -> Signal a -> Signal (Tuple a b)
withLatest = withLatestImpl Tuple

foreign import withLatestImpl :: forall a b. (a -> b -> Tuple a b) -> Signal b -> Signal a -> Signal (Tuple a b)

-- | The value of whichever signal the outer signal holds: `join`. The inner
-- | signal is rebuilt only when the outer one changes, and the branch no
-- | longer read is released. (RxJS `switchAll`.)
switchLatest :: forall a. Signal (Signal a) -> Signal a
switchLatest s = bindImpl s identity

-- | The last n values, oldest first, starting with the current one; for
-- | sparklines and undo. Stateful: it records only while observed.
foreign import history :: forall a. Int -> Signal a -> Signal (Array a)

-- | Recover from a derivation that throws: the handler's value while the
-- | signal's computation fails, and the signal's value again once it
-- | succeeds. The failing node stays consistent: it recomputes when its
-- | inputs change, and its next successful computation clears the error.
-- | (RxJS `catchError` for pure derivations.)
catching :: forall a. (Error -> a) -> Signal a -> Signal a
catching handler s = map (either handler identity) (attempt s)

-- | `Right` the signal's value, or `Left` the error its computation throws.
attempt :: forall a. Signal a -> Signal (Either Error a)
attempt = attemptImpl Left Right

foreign import attemptImpl :: forall a. (Error -> Either Error a) -> (a -> Either Error a) -> Signal a -> Signal (Either Error a)

-- | The latest of two signals, starting at the left one; the left wins ties.
foreign import merge :: forall a. Signal a -> Signal a -> Signal a

-- | The latest value that satisfies the predicate, starting at the seed
-- | unless the input satisfies it at the start. Stateful: it pauses.
-- | (`Event.filter` keeps occurrences; a signal always has a value, so this
-- | one keeps the last that passed.)
foreign import latestWhere :: forall a. (a -> Boolean) -> a -> Signal a -> Signal a

-- | Follows the input while the condition is true and holds its last value
-- | while it is false; when the condition becomes true it takes the input's
-- | current value. Starts at the seed unless the condition holds at the start.
-- | Stateful: it pauses. The signal counterpart of `Event.gate`.
foreign import gate :: forall a. Signal Boolean -> a -> Signal a -> Signal a

-- | The current value, without recording a dependency.
foreign import read :: forall a. Signal a -> Effect a

foreign import subscribeImpl :: forall a. Scope -> Signal a -> (a -> Effect Unit) -> Effect Unit

-- | Call the function with the signal's value now and whenever it changes,
-- | until the current scope is disposed. The callback runs untracked; writes
-- | it makes take effect in the next flush round, and it never runs
-- | re-entrantly.
subscribe :: forall a. Signal a -> (a -> Effect Unit) -> Owned Unit
subscribe sig cb = Owned \s -> subscribeImpl s sig cb

foreign import holdImpl :: forall a. Scope -> Signal a -> Effect (Signal a)

-- | Observe a signal for the lifetime of the current scope, so a stateful
-- | signal advances whether or not anything else reads it. Returns the same
-- | signal. The signal counterpart of `Event.hold`.
hold :: forall a. Signal a -> Owned (Signal a)
hold sig = Owned \s -> holdImpl s sig

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

-- | `sampleMany` followed by a function: the result changes when a field of
-- | the second record changes, using the current values of the first's.
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
