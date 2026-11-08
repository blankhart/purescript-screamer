-- | A mock WebSocket for the tests.
module Test.MockWebSocket where

import Prelude

import Effect (Effect)
import Screamer.Web.WebSocket (CloseInfo)

foreign import installMockWebSocket :: Effect Unit
foreign import uninstallMockWebSocket :: Effect Unit
foreign import serverOpen :: Effect Unit
foreign import serverSend :: String -> Effect Unit
foreign import socketInfo :: Effect { url :: String, sent :: Array String, closed :: Boolean }
foreign import socketCount :: Effect Int
foreign import listenerCount :: Effect Int
foreign import serverClose :: CloseInfo -> Effect Unit
foreign import staleEvents :: Effect Unit
foreign import failNextOpen :: Effect Unit
