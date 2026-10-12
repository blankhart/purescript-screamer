-- | Test helpers that observe signals with effects from the core directly.
module Test.Observe
  ( Observer
  , observe
  ) where

import Prelude

import Effect (Effect)
import Screamer.Signal (Signal)

type Observer a = { trace :: Effect (Array a), stop :: Effect Unit }

-- | Observe a signal in a fresh root scope, recording each value it shows.
foreign import observe :: forall a. Signal a -> Effect (Observer a)
