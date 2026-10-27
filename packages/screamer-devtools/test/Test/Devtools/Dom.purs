module Test.Devtools.Dom where

import Prelude

import Effect (Effect)
import Web.DOM.Node (Node)

foreign import querySelector :: String -> Effect Node

foreign import firstChild :: Node -> Effect Node

-- | Change the text of the first child of the element, behind Screamer's back.
foreign import setTextOf :: String -> String -> Effect Unit

-- | `snapshotText` through `window.__SCREAMER_DEVTOOLS__`.
foreign import globalSnapshotText :: Effect String
