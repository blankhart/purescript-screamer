-- | An element's size and visibility as signals, through `ResizeObserver`
-- | and `IntersectionObserver`.
module Screamer.Web.Observers
  ( Size
  , resize
  , intersecting
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Renderer (interactive)
import Screamer.Signal (Signal)
import Screamer.Source (batch, signalSource)
import Web.DOM.Element (Element)

type Size = { width :: Number, height :: Number }

foreign import resizeImpl :: Element -> (Size -> Effect Unit) -> Effect (Effect Unit)

foreign import intersectingImpl :: Element -> (Boolean -> Effect Unit) -> Effect (Effect Unit)

-- | The element's content box, `{ width: 0, height: 0 }` until the
-- | observer first reports. When the backend is not interactive it stays
-- | there and no observer is created.
resize :: Element -> Owned (Signal Size)
resize = observe { width: 0.0, height: 0.0 } resizeImpl

-- | Whether the element intersects the viewport; false until the observer
-- | first reports, and always when the backend is not interactive.
intersecting :: Element -> Owned (Signal Boolean)
intersecting = observe false intersectingImpl

observe :: forall a. a -> (Element -> (a -> Effect Unit) -> Effect (Effect Unit)) -> Element -> Owned (Signal a)
observe initial start el = do
  live <- interactive
  if not live then pure (pure initial)
  else do
    src <- liftEffect $ signalSource initial
    stop <- liftEffect $ start el \v -> batch (src.put v)
    onCleanup stop
    pure src.signal
