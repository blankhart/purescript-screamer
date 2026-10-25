-- | `localStorage` and `sessionStorage` entries as signal sources.
module Screamer.Web.Storage
  ( localStorage
  , sessionStorage
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Renderer (interactive)
import Screamer.Source (SignalSource, batch, signalSource)

foreign import readImpl :: Boolean -> String -> String -> Effect String

foreign import writeImpl :: Boolean -> String -> String -> Effect Unit

foreign import onStorageImpl :: Boolean -> String -> String -> (String -> Effect Unit) -> Effect (Effect Unit)

-- | The entry under the key, or the default when there is none. `putT1` and
-- | `modifyT1` write the entry; a change made by another tab (the `storage`
-- | event) updates the signal. When the backend is not interactive (on a
-- | server) the source holds the default and drops writes.
localStorage :: String -> String -> Owned (SignalSource String)
localStorage = entry true

-- | `localStorage` for `sessionStorage`.
sessionStorage :: String -> String -> Owned (SignalSource String)
sessionStorage = entry false

entry :: Boolean -> String -> String -> Owned (SignalSource String)
entry local key dflt = do
  live <- interactive
  if not live then do
    src <- liftEffect $ signalSource dflt
    pure src { putT1 = \_ -> pure unit, modifyT1 = \_ -> pure unit }
  else do
    src <- liftEffect $ signalSource =<< readImpl local key dflt
    stop <- liftEffect $ onStorageImpl local key dflt \v -> batch (src.putT1 v)
    onCleanup stop
    let
      store = writeImpl local key =<< src.readT1
    pure
      { signal: src.signal
      , readT1: src.readT1
      , putT1: \v -> src.putT1 v *> store
      -- Through the cell's own `modifyT1`, so two made before the next
      -- timestep compose.
      , modifyT1: \f -> src.modifyT1 f *> store
      }
