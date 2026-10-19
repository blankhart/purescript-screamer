-- | Sources: the writable inputs of the reactive graph.
-- |
-- | A signal source holds a current value; a write that changes it propagates
-- | to whatever observes the signal. An event source adds occurrences: each
-- | `fire` is one occurrence, delivered to whatever observes the event, even
-- | when it repeats the last one or shares a batch with others.
module Screamer.Source
  ( SignalSource
  , signalSource
  , focus
  , prop
  , EventSource
  , eventSource
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

-- | A writable cell and the signal that reads it.
type SignalSource a =
  { signal :: Signal a
  , put :: a -> Effect Unit
  , modify :: (a -> a) -> Effect Unit
  }

foreign import signalSource :: forall a. a -> Effect (SignalSource a)

-- | A source for part of another source's value. Its `signal` is the part,
-- | through `get`; `put` and `modify` write the whole through the parent's
-- | `modify`, with `set`. A getter and setter rather than a lens, so the
-- | core needs no optics library; `{ get: view l, set: set l }` adapts a
-- | `Lens'`.
focus :: forall s a. { get :: s -> a, set :: a -> s -> s } -> SignalSource s -> SignalSource a
focus l parent =
  { signal: l.get <$> parent.signal
  , put: \a -> parent.modify (l.set a)
  , modify: \f -> parent.modify \s -> l.set (f (l.get s)) s
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

-- | An event and the action that fires it. Fires inside one `batch` (an
-- | event handler is one) are delivered together, in fire order, when the
-- | batch ends. Firing inside a derivation is an error.
type EventSource a =
  { event :: Event a
  , fire :: a -> Effect Unit
  }

foreign import eventSource :: forall a. Effect (EventSource a)

-- | Run an action; the effects its writes trigger run once, when it returns.
foreign import batch :: forall a. Effect a -> Effect a
