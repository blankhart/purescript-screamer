-- | Sources: the writable inputs of the reactive graph.
-- |
-- | A signal source holds a current value; a write that changes it propagates
-- | to whatever observes the signal. An event source adds occurrences: each
-- | `fireT1` is one occurrence, delivered to whatever observes the event, even
-- | when it repeats the last one or shares a batch with others.
-- |
-- | Names that read or write say which timestep they act on. T0 is the
-- | current timestep, the one whose values every subscriber sees; T1 is the
-- | next. `readT0` (in `Screamer.Signal`) gives the value of T0. `putT1`,
-- | `modifyT1` and `fireT1` take effect when T1 starts, and `readT1` gives
-- | the value T1 will start with. Outside any timestep and any `batch`, as
-- | in a lone write from a foreign callback, T1 starts as soon as the write
-- | is made, so a `readT0` after it returns the new value.
-- |
-- | **Order within a timestep.** Writes and fires made for one timestep are
-- | applied in the order they were made. For one subscriber, one event
-- | handler or one component's setup code, that is the order of the code.
-- | Between different subscribers it is the order they run in: subscribers
-- | notified in a timestep run in the order they were created, and one
-- | created during a timestep (in a component that `dyn` or `each` mounts)
-- | runs once when it is created. So when two subscribers write one source
-- | for the same timestep, the `putT1` of the one created last is the one
-- | applied, `modifyT1`s compose in creation order, and `fireT1`s deliver
-- | their occurrences in creation order. This order is part of the
-- | semantics, but it is not one the program states, and it changes when a
-- | component moves or mounts in a different order: swapping two
-- | independent `Owned` actions whose subscribers write one source can
-- | change the result. In development the runtime warns when it happens
-- | (see `commutingSignalSource` for writes that don't depend on it). To
-- | state an order, feed both causes into one event, or write from one
-- | subscriber.
module Screamer.Source
  ( SignalSource
  , signalSource
  , commutingSignalSource
  , focus
  , prop
  , EventSource
  , eventSource
  , commutingEventSource
  , batch
  ) where

import Prelude

import Data.Symbol (class IsSymbol)
import Effect (Effect)
import Prim.Row as Row
import Record as Record
import Screamer.Event (Event)
import Screamer.Signal (Signal)
import Type.Proxy (Proxy)

-- | A writable cell and the signal that reads it. `putT1` and `modifyT1`
-- | take effect at the start of the next timestep (T1), whether they are
-- | made by a subscriber, by setup code, or inside a `batch` (an event
-- | handler is one); until then `readT0` returns the old value. Of several
-- | `putT1`s made before T1 starts, the last is the one applied.
-- | `modifyT1` applies its function to `readT1`, the value including writes
-- | already made for T1, so two `modifyT1`s compose.
type SignalSource a =
  { signal :: Signal a
  , readT1 :: Effect a
  , putT1 :: a -> Effect Unit
  , modifyT1 :: (a -> a) -> Effect Unit
  }

foreign import signalSource :: forall a. a -> Effect (SignalSource a)

-- | `signalSource` for a source whose writes from different subscribers in
-- | one timestep commute, such as increments of a counter or inserts of
-- | different keys. It turns off the development warning for such writes;
-- | they still apply in subscriber order.
foreign import commutingSignalSource :: forall a. a -> Effect (SignalSource a)

-- | A source for part of another source's value. Its `signal` is the part,
-- | through `get`; `readT1` reads the parent's through `get`, and `putT1`
-- | and `modifyT1` write the whole through the parent's `modifyT1`, with
-- | `set`. A getter and setter rather than a lens, so the
-- | core needs no optics library; `{ get: view l, set: set l }` adapts a
-- | `Lens'`.
focus :: forall s a. { get :: s -> a, set :: a -> s -> s } -> SignalSource s -> SignalSource a
focus l parent =
  { signal: l.get <$> parent.signal
  , readT1: l.get <$> parent.readT1
  , putT1: \a -> parent.modifyT1 (l.set a)
  , modifyT1: \f -> parent.modifyT1 \s -> l.set (f (l.get s)) s
  }

-- | A source for one field of a record source.
prop
  :: forall l r r' a
   . IsSymbol l
  => Row.Cons l a r' r
  => Proxy l
  -> SignalSource (Record r)
  -> SignalSource a
prop l = focus { get: Record.get l, set: Record.set l }

-- | An event and the action that fires it. An occurrence fired with
-- | `fireT1` is delivered at the start of the next timestep (T1). Fires
-- | inside one `batch` (an event handler is one) are delivered together, in
-- | fire order, when the batch ends. Firing inside a derivation is an error.
type EventSource a =
  { event :: Event a
  , fireT1 :: a -> Effect Unit
  }

foreign import eventSource :: forall a. Effect (EventSource a)

-- | `eventSource` for an event whose consumers don't depend on the order of
-- | occurrences fired by different subscribers in one timestep. It turns off
-- | the development warning for such fires.
foreign import commutingEventSource :: forall a. Effect (EventSource a)

-- | Run an action as one step. Its writes and fires take effect together in
-- | the timestep that starts when the outermost batch returns, and the
-- | effects they trigger run once then.
foreign import batch :: forall a. Effect a -> Effect a
