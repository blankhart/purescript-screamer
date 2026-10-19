-- | Animation-frame loops owned by the current scope: they stop when it is
-- | disposed.
module Screamer.Subscriptions.AnimationFrame
  ( frames
  , every
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal)
import Screamer.Source (signalSource)

foreign import nowImpl :: Effect Number

foreign import loopImpl :: (Number -> Effect Unit) -> Effect (Effect Unit)

-- | The timestamp of the latest animation frame, in milliseconds on the
-- | `performance.now()` clock. It starts at the current time.
frames :: Owned (Signal Number)
frames = do
  time <- liftEffect $ signalSource =<< nowImpl
  cancel <- liftEffect $ loopImpl time.put
  onCleanup cancel
  pure time.signal

-- | Run an action on every animation frame.
every :: Effect Unit -> Owned Unit
every action = do
  cancel <- liftEffect $ loopImpl (const action)
  onCleanup cancel
