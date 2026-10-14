-- | Signal sources: the writable inputs of the reactive graph. Each holds a
-- | current value; a write that changes it propagates to whatever observes
-- | the signal.
module Screamer.SignalSource
  ( SignalSource
  , signalSource
  , batch
  ) where

import Prelude

import Effect (Effect)
import Screamer.Signal (Signal)

-- | A writable cell and the signal that reads it.
type SignalSource a =
  { signal :: Signal a
  , put :: a -> Effect Unit
  , modify :: (a -> a) -> Effect Unit
  }

foreign import signalSource :: forall a. a -> Effect (SignalSource a)

-- | Run an action; the effects its writes trigger run once, when it returns.
foreign import batch :: forall a. Effect a -> Effect a
