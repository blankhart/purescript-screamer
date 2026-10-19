-- | Test helpers: observe signals and events, and run a spec.
module Screamer.Test
  ( Observer
  , observe
  , EventObserver
  , observeE
  , runSpec
  ) where

import Prelude

import Data.Identity (Identity(..))
import Data.Newtype (un)
import Effect (Effect)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.Owned (runOwned)
import Screamer.Signal (Signal)
import Test.Spec (Spec)
import Test.Spec.Reporter (consoleReporter)
import Test.Spec.Runner (defaultConfig, evalSpecT)
import Test.Spec.Summary (successful)

type Observer a = { trace :: Effect (Array a), stop :: Effect Unit }

-- | Observe a signal in a fresh root scope, recording each value it shows.
-- | It observes with an effect from the core directly.
foreign import observe :: forall a. Signal a -> Effect (Observer a)

type EventObserver a = { trace :: Effect (Array a), stop :: Effect Unit }

-- | Subscribe to an event in a fresh root scope, recording each occurrence.
observeE :: forall a. Event a -> Effect (EventObserver a)
observeE e = do
  seen <- Ref.new []
  r <- runOwned $ Event.subscribe e \a -> Ref.modify_ (_ <> [ a ]) seen
  pure { trace: Ref.read seen, stop: r.dispose }

foreign import exit :: Int -> Effect Unit

-- | Run the spec with the console reporter, and set the process's exit code
-- | to 1 if anything failed.
runSpec :: Spec Unit -> Effect Unit
runSpec spec = launchAff_ do
  results <- un Identity $ evalSpecT (defaultConfig { exit = false }) [ consoleReporter ] spec
  liftEffect $ exit if successful results then 0 else 1
