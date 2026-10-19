module Test.Router.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Router as Router

main :: Effect Unit
main = runSpec do
  Router.spec
