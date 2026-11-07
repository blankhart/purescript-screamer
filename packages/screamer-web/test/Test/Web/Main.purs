module Test.Web.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Sources as Sources
import Test.WebSocket as WebSocket

main :: Effect Unit
main = runSpec do
  WebSocket.spec
  Sources.spec
