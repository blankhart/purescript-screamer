-- | Signals: time-varying values. Everything here is pure: a `Signal` is a
-- | description of a node in the reactive graph, and allocating one has no
-- | effect on the graph until something observes it.
-- |
-- | Derived signals (`map`, `apply`, `bind`, `sampleOn`, `sampleManyWith`,
-- | `dropRepeatsBy`) are cached while observed and recomputed on demand
-- | otherwise. A node propagates a change only when its value changes under
-- | its equality (`Object.is` by default, `Eq` through `dropRepeats`).
-- |
-- | Stateful signals (`fold`, `merge`, `filter`, `filterOn`) advance only
-- | while observed:
-- |
-- | - Start. State begins at the seed (for `merge`, the left input's current
-- |   value). Values the input held before observation are not stepped over.
-- | - Step. One step per propagation in which an input changed. Writes inside
-- |   one batch coalesce, so two writes in one handler step a `fold` once.
-- | - Pause. When the last observer goes, the node unlinks and keeps its
-- |   state. `read` returns that state. When observed again it
-- |   resynchronizes with its inputs without stepping, then continues.
-- | - Simultaneity. When both inputs of `merge` change in one batch, the left
-- |   wins (like Reflex's `leftmost`).
-- |
-- | Two evaluations of the same stateful expression produce the same values
-- | whenever they are observed over the same interval. Use
-- | `Screamer.Owned.hold` where a program needs one state regardless of who
-- | observes it.
module Screamer.Signal
  ( Signal
  , sampleOn
  , sampleMany
  , sampleManyWith
  , dropRepeats
  , dropRepeatsBy
  , dropRepeatsOn
  , withPrevious
  , fold
  , merge
  , filter
  , filterOn
  , read
  , class SignalRecord
  , class UnsignalRecord
  , class SignalRowList
  ) where

import Prelude

import Control.Alt (class Alt)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Prim.Row (class Nub, class Union)
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

-- | Accumulate from a seed, one step per propagation in which the input changed.
foreign import fold :: forall a b. (a -> b -> b) -> b -> Signal a -> Signal b

-- | The latest of two signals, starting at the left one; the left wins ties.
foreign import merge :: forall a. Signal a -> Signal a -> Signal a

-- | The values that satisfy the predicate, starting at the seed unless the
-- | input satisfies it at the start.
foreign import filter :: forall a. (a -> Boolean) -> a -> Signal a -> Signal a

-- | Follows the input while the condition is true and holds its last value
-- | while it is false; when the condition becomes true it takes the input's
-- | current value. Starts at the seed unless the condition holds at the start.
foreign import filterOn :: forall a. Signal Boolean -> a -> Signal a -> Signal a

-- | The current value, without recording a dependency.
foreign import read :: forall a. Signal a -> Effect a

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
