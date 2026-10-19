-- | Whether the page is visible and the browser is online, as signals.
module Screamer.Web.Page
  ( visible
  , online
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal)
import Screamer.Source (batch, signalSource)

foreign import visibleNow :: Effect Boolean

foreign import onVisibilityChange :: Effect Unit -> Effect (Effect Unit)

foreign import onlineNow :: Effect Boolean

foreign import onOnlineChange :: Effect Unit -> Effect (Effect Unit)

-- | Whether the page is visible (`document.visibilityState`), updated on
-- | `visibilitychange`. True when the backend is not interactive.
visible :: Owned (Signal Boolean)
visible = follow visibleNow onVisibilityChange

-- | Whether the browser is online (`navigator.onLine`), updated on
-- | `online` and `offline`. True when the backend is not interactive.
online :: Owned (Signal Boolean)
online = follow onlineNow onOnlineChange

follow :: Effect Boolean -> (Effect Unit -> Effect (Effect Unit)) -> Owned (Signal Boolean)
follow now listen = do
  live <- interactive
  if not live then pure (pure true)
  else do
    src <- liftEffect $ signalSource =<< now
    stop <- liftEffect $ listen (batch (src.put =<< now))
    onCleanup stop
    pure src.signal
