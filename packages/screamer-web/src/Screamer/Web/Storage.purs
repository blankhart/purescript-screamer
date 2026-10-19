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
import Screamer.Signal (read)
import Screamer.Source (SignalSource, batch, signalSource)

foreign import readImpl :: Boolean -> String -> String -> Effect String

foreign import writeImpl :: Boolean -> String -> String -> Effect Unit

foreign import onStorageImpl :: Boolean -> String -> String -> (String -> Effect Unit) -> Effect (Effect Unit)

-- | The entry under the key, or the default when there is none. `put` and
-- | `modify` write the entry; a change made by another tab (the `storage`
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
  src <- liftEffect $ signalSource dflt
  if not live then
    pure src { put = \_ -> pure unit, modify = \_ -> pure unit }
  else do
    liftEffect $ src.put =<< readImpl local key dflt
    stop <- liftEffect $ onStorageImpl local key dflt \v -> batch (src.put v)
    onCleanup stop
    let
      put v = writeImpl local key v *> src.put v
    pure { signal: src.signal, put, modify: \f -> read src.signal >>= put <<< f }
