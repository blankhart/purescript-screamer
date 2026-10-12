-- | Fakes for the subscription tests.
module Test.Fakes where

import Prelude

import Effect (Effect)

foreign import installFakeTimers :: Effect Unit
foreign import uninstallFakeTimers :: Effect Unit
foreign import advance :: Number -> Effect Unit
foreign import pendingTimers :: Effect Int

foreign import installFakeFrames :: Effect Unit
foreign import uninstallFakeFrames :: Effect Unit
foreign import frame :: Number -> Effect Unit
foreign import pendingFrames :: Effect Int

foreign import installMockWebSocket :: Effect Unit
foreign import uninstallMockWebSocket :: Effect Unit
foreign import serverOpen :: Effect Unit
foreign import serverSend :: String -> Effect Unit
foreign import socketInfo :: Effect { url :: String, sent :: Array String, closed :: Boolean }
