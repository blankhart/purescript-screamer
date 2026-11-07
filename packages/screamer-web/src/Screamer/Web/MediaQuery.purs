-- | CSS media queries as signals.
module Screamer.Web.MediaQuery
  ( matches
  , matchesNow
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal)
import Screamer.Source (batch, signalSource)

foreign import matchesNowImpl :: String -> Effect Boolean

foreign import matchImpl :: String -> (Boolean -> Effect Unit) -> Effect { now :: Boolean, stop :: Effect Unit }

-- | Whether the media query (such as `"(prefers-color-scheme: dark)"`)
-- | matches, updated when that changes. False when the backend is not
-- | interactive.
matches :: String -> Owned (Signal Boolean)
matches query = do
  live <- interactive
  if not live then pure (pure false)
  else do
    src <- liftEffect $ signalSource false
    m <- liftEffect $ matchImpl query \v -> batch (src.putT1 v)
    liftEffect $ src.putT1 m.now
    onCleanup m.stop
    pure src.signal

-- | Whether the media query matches now, read once with no listener: for
-- | code that checks a preference at the moment it acts, such as an
-- | animation deciding whether to run. False where there is no
-- | `window.matchMedia`, as on a server.
matchesNow :: String -> Effect Boolean
matchesNow = matchesNowImpl
