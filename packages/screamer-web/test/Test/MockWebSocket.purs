-- | A mock WebSocket for the tests.
module Test.MockWebSocket where

import Prelude

import Effect (Effect)

foreign import installMockWebSocket :: Effect Unit
foreign import uninstallMockWebSocket :: Effect Unit
foreign import serverOpen :: Effect Unit
foreign import serverSend :: String -> Effect Unit
foreign import socketInfo :: Effect { url :: String, sent :: Array String, closed :: Boolean }
