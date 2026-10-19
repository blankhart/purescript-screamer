-- | Sources: the writable inputs of the reactive graph.
-- |
-- | A signal source holds a current value; a write that changes it propagates
-- | to whatever observes the signal. An event source adds occurrences: each
-- | `fire` is one occurrence, delivered to whatever observes the event, even
-- | when it repeats the last one or shares a batch with others.
module Screamer.Source
  ( SignalSource
  , signalSource
  , EventSource
  , eventSource
  , batch
  ) where

import Prelude

import Effect (Effect)
import Screamer.Event (Event)
import Screamer.Signal (Signal)

-- | A writable cell and the signal that reads it.
type SignalSource a =
  { signal :: Signal a
  , put :: a -> Effect Unit
  , modify :: (a -> a) -> Effect Unit
  }

foreign import signalSource :: forall a. a -> Effect (SignalSource a)

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
