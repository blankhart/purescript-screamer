module Test.Reactive.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Owned as Owned
import Test.Signal as Signal
import Test.Source as Source
import Test.Spec (describe, it)
import Test.Spec.Assertions (shouldEqual)

main :: Effect Unit
main = runSpec do
  describe "harness" do
    it "runs PureScript tests" do
      (1 + 1) `shouldEqual` 2
  Signal.spec
  Owned.spec
  Source.spec
