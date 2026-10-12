-- | Channels: the sources of the reactive graph.
module Screamer.Channel
  ( Channel
  , channel
  , batch
  ) where

import Prelude

import Effect (Effect)
import Screamer.Signal (Signal)

-- | A writable cell and the signal that reads it.
type Channel a =
  { signal :: Signal a
  , put :: a -> Effect Unit
  , modify :: (a -> a) -> Effect Unit
  }

foreign import channel :: forall a. a -> Effect (Channel a)

-- | Run an action; the effects its writes trigger run once, when it returns.
foreign import batch :: forall a. Effect a -> Effect a
