module Test.Inert where

import Screamer.Renderer (Backend)
import Web.DOM.Element (Element)

-- | A backend whose only field is `interactive = false`.
foreign import inertBackend :: Backend

-- | No element at all: a non-interactive source must not touch it.
foreign import noElement :: Element
