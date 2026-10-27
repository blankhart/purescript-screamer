module Test.Motion.Dom where

import Prelude

import Effect (Effect)
import Screamer.Renderer (Backend)

-- | The class attribute of the first element matching the selector.
foreign import classes :: String -> Effect String

-- | One inline style property of the first element matching the selector.
foreign import styleOf :: String -> String -> Effect String

-- | How many elements match the selector.
foreign import count :: String -> Effect Int

-- | Dispatch a bubbling event of the type on the first matching element.
foreign import dispatch :: String -> String -> Effect Unit

-- | Rects from each element's index among its siblings; returns restore.
foreign import stubRects :: Effect (Effect Unit)

-- | A recording `Element.animate`; returns restore.
foreign import stubAnimate :: Effect (Effect Unit)

type Animation = { text :: String, state :: String, transforms :: Array String, opacities :: Array String }

-- | The animations started since `stubAnimate`.
foreign import animationLog :: Effect (Array Animation)

-- | Finish every running animation (its promise settles later).
foreign import finishAll :: Effect Unit

-- | A `document.startViewTransition` that runs the action, then the update.
foreign import stubViewTransition :: Effect Unit -> Effect (Effect Unit)

-- | A `window.matchMedia` whose reduced-motion query the test sets.
foreign import installMatchMedia :: Effect Unit

foreign import uninstallMatchMedia :: Effect Unit

foreign import setReduced :: Boolean -> Effect Unit

-- | The backend, not interactive.
foreign import inert :: Backend -> Backend
