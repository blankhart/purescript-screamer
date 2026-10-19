module Test.Resource.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Errors as Errors
import Test.Pending as Pending
import Test.Resource as Resource

main :: Effect Unit
main = runSpec do
  Errors.spec
  Pending.spec
  Resource.spec
