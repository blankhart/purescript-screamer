-- | Event sources: the inputs of the reactive graph that add occurrences.
-- | Each `fire` is one occurrence, delivered to whatever observes the event,
-- | even when it repeats the last one or shares a batch with others.
module Screamer.EventSource
  ( EventSource
  , eventSource
  , module Screamer.SignalSource
  ) where

import Effect (Effect)
import Prelude (Unit)
import Screamer.Event (Event)
import Screamer.SignalSource (batch)

-- | An event and the action that fires it. Fires inside one `batch` (an
-- | event handler is one) are delivered together, in fire order, when the
-- | batch ends. Firing inside a derivation is an error.
type EventSource a =
  { event :: Event a
  , fire :: a -> Effect Unit
  }

foreign import eventSource :: forall a. Effect (EventSource a)
