-- | Shared by the screamer-motion modules; not part of the API.
module Screamer.Motion.Internal
  ( animating
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Host (Host, host)
import Screamer.Motion.ReducedMotion (reducedMotionNow)
import Screamer.Owned (Owned, onCleanup)

-- | Start an animation with the scope's host, unless motion is reduced,
-- | when `instead` runs. The action the animation returns, which cancels
-- | it, runs when the scope is disposed.
animating :: Effect Unit -> (Host -> Effect (Effect Unit)) -> Owned Unit
animating instead start = do
  reduced <- reducedMotionNow >>= liftEffect
  if reduced then liftEffect instead
  else do
    h <- host
    cancel <- liftEffect (start h)
    onCleanup cancel
