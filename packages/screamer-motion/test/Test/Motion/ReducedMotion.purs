module Test.Motion.ReducedMotion (spec) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (Element(..), element_, instantiate)
import Screamer.Element.Unsafe (instantiateWith)
import Screamer.Motion.ReducedMotion (reducedMotionNow, withReducedMotion)
import Screamer.Renderer (Backend, browserBackend)
import Test.Motion.Dom (inert, installMatchMedia, setReduced, uninstallMatchMedia)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

-- | What `reducedMotionNow` says inside the wrapper, built with the backend.
probe :: Backend -> (Element -> Element) -> Effect Boolean
probe backend wrap = do
  seen <- Ref.new false
  let
    el = Element do
      reduced <- reducedMotionNow
      liftEffect $ reduced >>= \r -> Ref.write r seen
      instantiate (element_ "i" [] [])
  r <- instantiateWith backend identity (wrap el)
  r.dispose
  Ref.read seen

spec :: Spec Unit
spec = describe "Screamer.Motion.ReducedMotion" do
  it "follows the user's preference, which withReducedMotion overrides either way" do
    liftEffect installMatchMedia
    liftEffect (probe browserBackend identity) >>= shouldEqual false
    liftEffect $ setReduced true
    liftEffect (probe browserBackend identity) >>= shouldEqual true
    liftEffect (probe browserBackend (withReducedMotion false)) >>= shouldEqual false
    liftEffect $ setReduced false
    liftEffect (probe browserBackend (withReducedMotion true)) >>= shouldEqual true
    liftEffect uninstallMatchMedia

  it "is reduced when the renderer is not interactive" do
    liftEffect (probe (inert browserBackend) (withReducedMotion false)) >>= shouldEqual true
