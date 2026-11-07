-- | Reduced motion: whether animations should run.
-- |
-- | Every hook and animated value in screamer-motion honours it by default.
-- | Where motion is reduced, or the renderer is not interactive (on a
-- | server), hooks complete at once: enter hooks leave the node in its
-- | final state, leave hooks call `done` in the same round, `tween` and
-- | `spring` jump to their targets, and `viewTransition` runs a plain
-- | `batch`. Since nothing then waits for `transitionend` or
-- | `animationend`, an app's own handlers for those events do not fire.
module Screamer.Motion.ReducedMotion
  ( ReducedMotionKey
  , reducedMotionKey
  , withReducedMotion
  , reducedMotionNow
  , reducedMotion
  , prefersReducedMotion
  ) where

import Prelude

import Data.Maybe (Maybe(..))
import Screamer.Context (class ContextKey, ask, provide)
import Effect (Effect)
import Screamer.Element (Element(..), instantiate)
import Screamer.Owned (Owned)
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal)
import Screamer.Web.MediaQuery (matches, matchesNow)
import Type.Proxy (Proxy(..))

-- | Whether motion is reduced, as an app sets it: `Just` overrides the
-- | user's preference either way, and the default `Nothing` follows it.
data ReducedMotionKey

instance ContextKey ReducedMotionKey (Maybe Boolean) where
  keyName _ = "Screamer.Motion.ReducedMotion.ReducedMotionKey"
  keyDefault _ = Nothing

reducedMotionKey :: Proxy ReducedMotionKey
reducedMotionKey = Proxy

-- | The media query of the user's preference.
prefersReducedMotion :: String
prefersReducedMotion = "(prefers-reduced-motion: reduce)"

-- | Reduce motion (`true`) or allow it (`false`) inside the element,
-- | whatever the user's preference.
withReducedMotion :: Boolean -> Element -> Element
withReducedMotion reduced el = Element (provide reducedMotionKey (Just reduced) (instantiate el))

-- | An action that says whether motion is reduced at the moment it runs:
-- | true when the renderer is not interactive, else what
-- | `withReducedMotion` set above the current scope, else whether
-- | `(prefers-reduced-motion: reduce)` matches. The context is read once,
-- | here; the media query each time the action runs.
reducedMotionNow :: Owned (Effect Boolean)
reducedMotionNow = do
  live <- interactive
  set <- ask reducedMotionKey
  pure case live, set of
    false, _ -> pure true
    _, Just reduced -> pure reduced
    _, Nothing -> matchesNow prefersReducedMotion

-- | Whether motion is reduced, as a signal that follows the user's
-- | preference when it changes (through `Screamer.Web.MediaQuery.matches`).
reducedMotion :: Owned (Signal Boolean)
reducedMotion = do
  live <- interactive
  set <- ask reducedMotionKey
  case live, set of
    false, _ -> pure (pure true)
    _, Just reduced -> pure (pure reduced)
    _, Nothing -> matches prefersReducedMotion
