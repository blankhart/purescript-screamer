-- | Events: occurrences at moments. Everything here is pure except
-- | `subscribe`: an `Event` is a description of a node in the reactive
-- | graph, and allocating one has no effect on the graph until something
-- | observes it.
-- |
-- | An event has no current value and no cutoff. Every occurrence
-- | propagates, including one equal to the last and several in one batch.
-- | Occurrences fired while nothing observes an event go nowhere.
-- |
-- | Stateful nodes over events (`stepper`, `fold`) start from their seed
-- | when first observed, step once per occurrence while observed, and keep
-- | their state when the last observer leaves. Unlike stateful signals they
-- | do not resynchronize on return: occurrences fired while paused are
-- | missed. Use `Screamer.Signal.hold` on a signal, or `hold` here on an
-- | event, to keep one advancing.
-- |
-- | This module reuses names from `Screamer.Signal`, so import it qualified: `import Screamer.Event as Event`. See
-- | `docs/combinators.md` for the full semantics. More operators (`take`,
-- | `zip`, `race`, buffering, ...) are in `Screamer.Event.Extra`, in the
-- | `screamer-combinators` package.
module Screamer.Event
  ( Event
  , changes
  , stepper
  , fold
  , tag
  , attach
  , attachWith
  , subscribe
  , hold
  -- Transform, filter and accumulate
  , mapAccum
  , withPrevious
  , startWith
  , dropRepeats
  , dropRepeatsBy
  , dropRepeatsOn
  , gate
  -- Combining
  , oneOf
  -- Flattening
  , switchEvent
  ) where

import Prelude

import Control.Alt (class Alt)
import Control.Plus (class Plus)
import Data.Compactable (class Compactable)
import Data.Either (Either, either)
import Data.Filterable (class Filterable)
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Screamer.Owned (Owned(..), Scope)
import Screamer.Signal (Signal)
import Unsafe.Coerce (unsafeCoerce)

foreign import data Event :: Type -> Type

foreign import mapImpl :: forall a b. (a -> b) -> Event a -> Event b

foreign import altImpl :: forall a. Event a -> Event a -> Event a

foreign import emptyImpl :: forall a. Event a

foreign import filterImpl :: forall a. (a -> Boolean) -> Event a -> Event a

foreign import filterMapImpl :: forall a b. (a -> { ok :: Boolean, v :: b }) -> Event a -> Event b

-- | Keep the occurrences the function maps to `Just`.
filterMapE :: forall a b. (a -> Maybe b) -> Event a -> Event b
filterMapE f = filterMapImpl \a -> case f a of
  Just b -> { ok: true, v: b }
  Nothing -> { ok: false, v: unsafeCoerce unit }

instance Functor Event where
  map = mapImpl

-- | `a <|> b` delivers the occurrences of both, in the order they were
-- | fired, losing none. Occurrences with the same fire stamp (two maps of
-- | one event) go left first.
instance Alt Event where
  alt = altImpl

-- | `empty` never fires.
instance Plus Event where
  empty = emptyImpl

instance Compactable Event where
  compact = filterMapE identity
  separate e = partitionMapE identity e

instance Filterable Event where
  partitionMap = partitionMapE
  partition p e = { yes: filterImpl p e, no: filterImpl (not <<< p) e }
  filterMap = filterMapE
  filter = filterImpl

partitionMapE :: forall a l r. (a -> Either l r) -> Event a -> { left :: Event l, right :: Event r }
partitionMapE f e =
  { left: filterMapE (either Just (const Nothing) <<< f) e
  , right: filterMapE (either (const Nothing) Just <<< f) e
  }

-- | One occurrence, with the new value, in each round in which the signal
-- | changed. A signal's writes coalesce within a batch, so this fires at
-- | most once per round, with the final value. Its occurrences come after
-- | every fire of the same round.
foreign import changes :: forall a. Signal a -> Event a

-- | The latest occurrence, starting at the seed. Stateful: it steps only
-- | while observed.
foreign import stepper :: forall a. a -> Event a -> Signal a

-- | Accumulate from a seed, one step per occurrence, in fire order.
-- | Stateful: it steps only while observed.
foreign import fold :: forall a b. (a -> b -> b) -> b -> Event a -> Signal b

-- | The signal's value at each occurrence.
tag :: forall a b. Signal b -> Event a -> Event b
tag = attachWith const

-- | Each occurrence paired with the signal's value.
attach :: forall a b. Signal b -> Event a -> Event (Tuple b a)
attach = attachWith Tuple

-- | Each occurrence combined with the signal's value. The signal is read at
-- | the end of the round, which is the value every effect in that round
-- | sees, not the value at the moment of the fire.
foreign import attachWith :: forall a b c. (b -> a -> c) -> Signal b -> Event a -> Event c

foreign import subscribeImpl :: forall a. Scope -> Event a -> (a -> Effect Unit) -> Effect Unit

-- | Call the function once per occurrence, in fire order, until the current
-- | scope is disposed. Occurrences from before the call are not delivered.
-- | The callback runs untracked; writes and fires it makes take effect in the
-- | next flush round.
subscribe :: forall a. Event a -> (a -> Effect Unit) -> Owned Unit
subscribe e cb = Owned \s -> subscribeImpl s e cb

foreign import holdImpl :: forall a. Scope -> Event a -> Effect (Event a)

-- | Observe an event for the lifetime of the current scope, so a stateful
-- | event (`take`, `mapAccum`, `dropRepeats`, ...) keeps stepping while
-- | nothing else observes it. Returns the same event. The event counterpart
-- | of `Screamer.Signal.hold`; see "Sharing" in `docs/combinators.md`.
hold :: forall a. Event a -> Owned (Event a)
hold e = Owned \s -> holdImpl s e

-- Transform, filter and accumulate (#19). The stateful ones start from
-- their seed when first observed and count only occurrences seen while
-- observed: a `take 3` observed again later does not restart.

-- | Thread a state through the occurrences, emitting one value for each,
-- | like `fold` but with an output per occurrence. (RxJS `scan` with a
-- | separate output.)
foreign import mapAccum :: forall a s b. (a -> s -> { state :: s, value :: b }) -> s -> Event a -> Event b

-- | Each occurrence with the one before it, from the second occurrence seen
-- | while observed. (RxJS `pairwise`.)
foreign import withPrevious :: forall a. Event a -> Event { previous :: a, current :: a }

-- | The latest occurrence, starting at the seed. An alias of `stepper`.
-- | (RxJS `startWith`.)
startWith :: forall a. a -> Event a -> Signal a
startWith = stepper

-- | Drop an occurrence equal to the one before it. (RxJS
-- | `distinctUntilChanged`.)
dropRepeats :: forall a. Eq a => Event a -> Event a
dropRepeats = dropRepeatsByImpl eq

dropRepeatsBy :: forall a. (a -> a -> Boolean) -> Event a -> Event a
dropRepeatsBy = dropRepeatsByImpl

-- | Drop an occurrence whose key equals the previous occurrence's key.
-- | (RxJS `distinctUntilKeyChanged`.)
dropRepeatsOn :: forall a k. Eq k => (a -> k) -> Event a -> Event a
dropRepeatsOn key = dropRepeatsByImpl \x y -> key x == key y

foreign import dropRepeatsByImpl :: forall a. (a -> a -> Boolean) -> Event a -> Event a

-- | The occurrences of rounds that end with the signal true. The event
-- | version of `Screamer.Signal.gate`.
foreign import gate :: forall a. Signal Boolean -> Event a -> Event a

-- Combining several streams (#20).

-- | Every input's occurrences, in fire order, as one node. It agrees with
-- | folding the array with `<|>`. (RxJS `merge`.)
foreign import oneOf :: forall a. Array (Event a) -> Event a

-- Flattening (#21). Flattening that owns inner work (timers, requests) is
-- in `Screamer.Flatten`.

-- | The occurrences of whichever event the signal currently holds. After a
-- | switch, the new event is followed from then on; nothing it fired before
-- | is delivered. (RxJS `switchMap` over events, `switchAll`.)
foreign import switchEvent :: forall a. Signal (Event a) -> Event a

-- | The occurrences of every event in the signal's array, in fire order.
-- | Not exported: `Screamer.Flatten`'s foreign module uses it.
foreign import mergeAll :: forall a. Signal (Array (Event a)) -> Event a
