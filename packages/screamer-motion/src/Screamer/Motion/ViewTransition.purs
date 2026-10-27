-- | The View Transitions API: animate the change one update makes to the
-- | page, such as a route change, by crossfading snapshots of the page
-- | before and after it. Same-document view transitions have been Baseline
-- | since October 2025; where the API is missing, or motion is reduced,
-- | the update runs as a plain `batch`.
module Screamer.Motion.ViewTransition
  ( viewTransition
  , viewTransitionHere
  ) where

import Prelude

import Effect (Effect)
import Screamer.Motion.ReducedMotion (prefersReducedMotion, reducedMotionNow)
import Screamer.Owned (Owned)
import Screamer.Web.MediaQuery (matchesNow)

foreign import viewTransitionImpl :: Boolean -> Effect Unit -> Effect Unit

-- | Run the update (its writes in one `batch`) inside
-- | `document.startViewTransition`, unless the user prefers reduced
-- | motion. The browser runs the update after it has captured the old
-- | page, so its writes land a frame or so later.
viewTransition :: Effect Unit -> Effect Unit
viewTransition update = do
  skip <- matchesNow prefersReducedMotion
  viewTransitionImpl skip update

-- | `viewTransition` as the current scope sees it: it also honours
-- | `withReducedMotion` and runs a plain `batch` when the renderer is not
-- | interactive.
viewTransitionHere :: Owned (Effect Unit -> Effect Unit)
viewTransitionHere = do
  reduced <- reducedMotionNow
  pure \update -> do
    skip <- reduced
    viewTransitionImpl skip update
