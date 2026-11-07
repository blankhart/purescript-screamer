-- | Test helpers: observe signals and events, and run a spec.
module Screamer.Test
  ( Observer
  , observe
  , observeOwned
  , EventObserver
  , observeE
  , observeOwnedE
  , runSpec
  , withoutStrict
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
import Screamer.Owned (Owned, runOwned)
import Screamer.Signal (Signal)
import Test.Spec (Spec)
import Test.Spec.Reporter (consoleReporter)
import Test.Spec.Runner (defaultConfig, evalSpecT)
import Test.Spec.Summary (successful)

type Observer a = { trace :: Effect (Array a), stop :: Effect Unit }

-- | Observe a signal in a fresh root scope, recording each value it shows.
-- | It observes with an effect from the core directly.
foreign import observe :: forall a. Signal a -> Effect (Observer a)

-- | Run the action in a fresh root scope and observe the signal it
-- | returns, such as a stateful one. `stop` also disposes the scope.
observeOwned :: forall a. Owned (Signal a) -> Effect (Observer a)
observeOwned make = do
  r <- runOwned make
  o <- observe r.value
  pure { trace: o.trace, stop: o.stop *> r.dispose }

type EventObserver a = { trace :: Effect (Array a), stop :: Effect Unit }

-- | Subscribe to an event in a fresh root scope, recording each occurrence.
observeE :: forall a. Event a -> Effect (EventObserver a)
observeE e = do
  seen <- Ref.new []
  r <- runOwned $ Event.subscribe e \a -> Ref.modify_ (_ <> [ a ]) seen
  pure { trace: Ref.read seen, stop: r.dispose }

-- | Run the action in a fresh root scope and subscribe to the event it
-- | returns, such as a stateful one. `stop` also disposes the scope.
observeOwnedE :: forall a. Owned (Event a) -> Effect (EventObserver a)
observeOwnedE make = do
  r <- runOwned make
  o <- observeE r.value
  pure { trace: o.trace, stop: o.stop *> r.dispose }

foreign import exit :: Int -> Effect Unit

foreign import strict :: Effect Unit

-- | Run the spec with the console reporter, and set the process's exit code
-- | to 1 if anything failed. Strict mode is on (#84): a development warning,
-- | such as a read of a paused stateful signal (`SCR001`) or unordered
-- | writes in one timestep (`SCR002`), is thrown as an error, so it fails
-- | the test that caused it. A test that expects a warning runs it under
-- | `withoutStrict`.
runSpec :: Spec Unit -> Effect Unit
runSpec spec = launchAff_ do
  liftEffect strict
  results <- un Identity $ evalSpecT (defaultConfig { exit = false }) [ consoleReporter ] spec
  liftEffect $ exit if successful results then 0 else 1

-- | Run the action with strict mode off, for a test that causes a
-- | development warning on purpose: the warning goes to the console.
foreign import withoutStrict :: forall a. Effect a -> Effect a
