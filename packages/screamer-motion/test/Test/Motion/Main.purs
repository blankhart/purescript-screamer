module Test.Motion.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Motion.Animate as Animate
import Test.Motion.ReducedMotion as ReducedMotion
import Test.Motion.Transition as Transition
import Test.Motion.Value as Value

main :: Effect Unit
main = runSpec do
  Transition.spec
  Animate.spec
  Value.spec
  ReducedMotion.spec
