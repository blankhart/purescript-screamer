module Test.Backend where

import Prelude

import Effect (Effect)
import Screamer.Renderer (Backend)
import Web.DOM.Node (Node)

type Recording =
  { backend :: Backend
  , ops :: Effect (Array String)
  , attach :: Node -> Effect Unit
  , html :: Effect String
  , click :: String -> Effect Unit
  }

-- | A backend over its own document that records the name of each
-- | operation; the flag is its `interactive`.
foreign import recordingBackend :: Boolean -> Effect Recording

-- | Run the action with the global document's node operations throwing.
foreign import guardDocument :: forall a. Effect a -> Effect a

-- | Append an empty `<div>` with the id to the body.
foreign import addTarget :: String -> Effect Unit

-- | Throw an error from pure code.
foreign import crash :: forall a. String -> a
