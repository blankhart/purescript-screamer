module Test.Motion.Transition (spec, mountOn) where

import Prelude

import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element(..), each, element_, instantiate, mount, text)
import Screamer.Host (withHost)
import Screamer.Motion.ReducedMotion (withReducedMotion)
import Screamer.Motion.Transition (Axis(..), fade, slide, transition, withoutTransitions)
import Screamer.Runtime (readStats)
import Screamer.Signal (Signal)
import Screamer.Source (signalSource)
import Screamer.Test.Clock (FakeHost, fakeHost)
import Screamer.Test.Dom (innerHTML, resetBody, textsOf)
import Test.Motion.Dom (classes, count, dispatch, stubRects, styleOf)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

-- | Mount on `#root` with the fake host, and motion allowed.
mountOn :: FakeHost -> Element -> Effect (Effect Unit)
mountOn fh el = mount "#root" $ Element $ withHost fh.host $ instantiate $ withReducedMotion false el

li :: Signal Int -> Element
li s = element_ "li" [] [ text (show <$> s) ]

classy :: Element -> Element
classy = transition
  { enter: { from: "e-from", active: "e-active", to: "e-to" }
  , leave: { from: "l-from", active: "l-active", to: "l-to" }
  , move: ""
  , duration: Milliseconds 200.0
  , appear: false
  }

-- | Two frames: the classes or styles set before have been painted.
paint :: FakeHost -> Effect Unit
paint fh = fh.advance 32.0

spec :: Spec Unit
spec = describe "Screamer.Motion.Transition" do
  describe "transition" do
    it "enters with from and active, swaps from for to after a paint, and clears at the duration" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1 ]
      before <- liftEffect readStats
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ classy $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 1, 2 ]
      liftEffect (classes "li:nth-child(1)") >>= shouldEqual ""
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual "e-from e-active"
      liftEffect (styleOf "li:nth-child(2)" "--screamer-duration") >>= shouldEqual "200ms"
      liftEffect $ paint fh
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual "e-active e-to"
      liftEffect $ fh.advance 199.0
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual "e-active e-to"
      liftEffect $ fh.advance 1.0
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual ""
      liftEffect (styleOf "li:nth-child(2)" "--screamer-duration") >>= shouldEqual ""
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount
      after <- liftEffect readStats
      (after.liveScopes - before.liveScopes) `shouldEqual` 0

    it "keeps a leaving row until the duration, then detaches it" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1, 2 ]
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ classy $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 1 ]
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual "l-from l-active"
      liftEffect $ paint fh
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual "l-active l-to"
      liftEffect $ fh.advance 200.0
      liftEffect (textsOf "li") >>= shouldEqual [ "1" ]
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount

    it "ends at the node's own transitionend when it comes first" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1, 2 ]
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ classy $ each identity items.signal \s -> element_ "li" [] [ element_ "b" [] [ text (show <$> s) ] ] ]
      liftEffect $ items.putT1 [ 1 ]
      liftEffect $ paint fh
      -- An end event from a child does not count.
      liftEffect $ dispatch "li:nth-child(2) b" "transitionend"
      liftEffect (count "li") >>= shouldEqual 2
      liftEffect $ dispatch "li:nth-child(2)" "transitionend"
      liftEffect (textsOf "li") >>= shouldEqual [ "1" ]
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount

    it "finishes a leaving row at once when its key returns" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1, 2 ]
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ classy $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 1 ]
      liftEffect $ items.putT1 [ 1, 2 ]
      liftEffect (textsOf "li") >>= shouldEqual [ "1", "2" ]
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual "e-from e-active"
      liftEffect $ fh.advance 300.0
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual ""
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount

    it "completes at once when motion is reduced" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1, 2 ]
      unmount <- liftEffect $ mountOn fh $ withReducedMotion true $ element_ "ul" [] [ classy $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 1 ]
      liftEffect (textsOf "li") >>= shouldEqual [ "1" ]
      liftEffect $ items.putT1 [ 1, 3 ]
      liftEffect (classes "li:nth-child(2)") >>= shouldEqual ""
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount

    it "slides a moved row back from its old place with the move class" do
      liftEffect resetBody
      restore <- liftEffect stubRects
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1, 2 ]
      let
        moving = transition
          { enter: { from: "", active: "", to: "" }
          , leave: { from: "", active: "", to: "" }
          , move: "m"
          , duration: Milliseconds 100.0
          , appear: false
          }
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ moving $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 2, 1 ]
      liftEffect (styleOf "li:nth-child(1)" "transform") >>= shouldEqual "translate(0px, 10px)"
      liftEffect (styleOf "li:nth-child(2)" "transform") >>= shouldEqual "translate(0px, -10px)"
      liftEffect $ paint fh
      liftEffect (classes "li:nth-child(1)") >>= shouldEqual "m"
      liftEffect (styleOf "li:nth-child(1)" "transform") >>= shouldEqual ""
      liftEffect $ fh.advance 100.0
      liftEffect (classes "li:nth-child(1)") >>= shouldEqual ""
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount
      liftEffect restore

  describe "presets" do
    it "fade writes its own transition and opacity" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1 ]
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ fade (Milliseconds 150.0) $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 1, 2 ]
      liftEffect (styleOf "li:nth-child(2)" "opacity") >>= shouldEqual "0"
      liftEffect (styleOf "li:nth-child(2)" "transition") >>= shouldEqual "opacity 150ms ease"
      liftEffect $ paint fh
      liftEffect (styleOf "li:nth-child(2)" "opacity") >>= shouldEqual ""
      liftEffect $ fh.advance 150.0
      liftEffect (styleOf "li:nth-child(2)" "transition") >>= shouldEqual ""
      liftEffect $ items.putT1 [ 1 ]
      liftEffect $ paint fh
      liftEffect (styleOf "li:nth-child(2)" "opacity") >>= shouldEqual "0"
      liftEffect $ fh.advance 150.0
      liftEffect (textsOf "li") >>= shouldEqual [ "1" ]
      liftEffect fh.scheduled >>= shouldEqual 0
      liftEffect unmount

    it "slide moves along its axis" do
      liftEffect resetBody
      fh <- liftEffect $ fakeHost 0.0
      items <- liftEffect $ signalSource [ 1 ]
      unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ slide { axis: Y, duration: Milliseconds 100.0 } $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 1, 2 ]
      liftEffect (styleOf "li:nth-child(2)" "transform") >>= shouldEqual "translateY(-100%)"
      liftEffect $ fh.advance 132.0
      liftEffect (styleOf "li:nth-child(2)" "transform") >>= shouldEqual ""
      liftEffect unmount

  it "withoutTransitions stops a nested list inheriting a transition" do
    liftEffect resetBody
    fh <- liftEffect $ fakeHost 0.0
    items <- liftEffect $ signalSource [ 1 ]
    unmount <- liftEffect $ mountOn fh $ classy $ element_ "ul" [] [ withoutTransitions $ each identity items.signal li ]
    liftEffect $ items.putT1 [ 1, 2 ]
    liftEffect (classes "li:nth-child(2)") >>= shouldEqual ""
    liftEffect $ items.putT1 [ 2 ]
    liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>2</li><!----></ul>"
    liftEffect unmount
