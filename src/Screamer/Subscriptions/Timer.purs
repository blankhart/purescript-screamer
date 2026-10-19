-- | Timers owned by the current scope: they stop when it is disposed.
module Screamer.Subscriptions.Timer
  ( every
  , after
  ) where

import Prelude

import Data.DateTime.Instant (Instant)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Now (now)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal)
import Screamer.Source (signalSource)

foreign import setIntervalImpl :: Number -> Effect Unit -> Effect (Effect Unit)

foreign import setTimeoutImpl :: Number -> Effect Unit -> Effect (Effect Unit)

-- | The current time, starting now and updated every interval.
every :: Milliseconds -> Owned (Signal Instant)
every (Milliseconds ms) = do
  time <- liftEffect $ signalSource =<< now
  cancel <- liftEffect $ setIntervalImpl ms (time.put =<< now)
  onCleanup cancel
  pure time.signal

-- | Run an action once after the delay, unless the scope is disposed first.
after :: Milliseconds -> Effect Unit -> Owned Unit
after (Milliseconds ms) action = do
  cancel <- liftEffect $ setTimeoutImpl ms action
  onCleanup cancel
