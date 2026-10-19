-- | CSS media queries as signals.
module Screamer.Web.MediaQuery
  ( matches
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal)
import Screamer.Source (batch, signalSource)

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
    m <- liftEffect $ matchImpl query \v -> batch (src.put v)
    liftEffect $ src.put m.now
    onCleanup m.stop
    pure src.signal
