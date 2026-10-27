module Test.Screamer.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Context as Context
import Test.Dom as Dom
import Test.Hooks as Hooks
import Test.Primitives as Primitives
import Test.Renderer as Renderer
import Test.TypedDom as TypedDom

main :: Effect Unit
main = runSpec do
  Context.spec
  Dom.spec
  Renderer.spec
  Primitives.spec
  Hooks.spec
  TypedDom.spec
