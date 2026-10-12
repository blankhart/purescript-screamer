module Test.Main where

import Prelude

import Data.Identity (Identity(..))
import Data.Newtype (un)
import Effect (Effect)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Test.Spec.Reporter (consoleReporter)
import Test.Spec.Runner (defaultConfig, evalSpecT)
import Test.Spec.Summary (successful)

foreign import exit :: Int -> Effect Unit

main :: Effect Unit
main = launchAff_ do
  results <- un Identity $ evalSpecT (defaultConfig { exit = false }) [ consoleReporter ] spec
  liftEffect $ exit if successful results then 0 else 1

spec :: Spec Unit
spec = do
  describe "harness" do
    it "runs PureScript tests" do
      (1 + 1) `shouldEqual` 2
