module Test.Motion.Animate (spec) where

import Prelude

import Data.Array as Array

import Data.Time.Duration (Milliseconds(..))
import Effect.Aff (Aff, delay)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (Element, each, element_, text, withEnter, withLeave)
import Screamer.Motion.Animate (Keyframe, animate, crossfade, flipMoves, keyframe, leaveWith)
import Screamer.Motion.ViewTransition (viewTransition)
import Screamer.Signal (Signal)
import Screamer.Source (batch, signalSource)
import Screamer.Test.Clock (fakeHost)
import Screamer.Test.Dom (resetBody, textsOf)
import Test.Motion.Dom (animationLog, finishAll, stubAnimate, stubRects, stubViewTransition, styleOf)
import Test.Motion.Transition (mountOn)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

li :: Signal Int -> Element
li s = element_ "li" [] [ text (show <$> s) ]

opts :: { duration :: Milliseconds, easing :: String }
opts = { duration: Milliseconds 100.0, easing: "ease-out" }

fadeOut :: Array Keyframe
fadeOut = [ keyframe { opacity: "1" }, keyframe { opacity: "0" } ]

-- | Let promise callbacks run.
settle :: Aff Unit
settle = delay (Milliseconds 0.0)

spec :: Spec Unit
spec = describe "Screamer.Motion.Animate" do
  it "leaveWith detaches the node when its animation finishes" do
    liftEffect resetBody
    restore <- liftEffect stubAnimate
    fh <- liftEffect $ fakeHost 0.0
    items <- liftEffect $ signalSource [ 1, 2 ]
    unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ withLeave (leaveWith fadeOut opts) $ each identity items.signal li ]
    liftEffect $ items.putT1 [ 1 ]
    liftEffect animationLog >>= shouldEqual [ { text: "2", state: "running", transforms: [ "", "" ], opacities: [ "1", "0" ] } ]
    liftEffect (textsOf "li") >>= shouldEqual [ "1", "2" ]
    liftEffect finishAll
    settle
    liftEffect (textsOf "li") >>= shouldEqual [ "1" ]
    liftEffect unmount
    liftEffect restore

  it "cancels an animation when its scope is disposed" do
    liftEffect resetBody
    restore <- liftEffect stubAnimate
    fh <- liftEffect $ fakeHost 0.0
    items <- liftEffect $ signalSource [ 1 ]
    unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ withEnter { appear: false } (animate fadeOut opts) $ each identity items.signal li ]
    liftEffect $ items.putT1 [ 1, 2 ]
    liftEffect $ items.putT1 [ 1 ]
    liftEffect animationLog >>= shouldEqual [ { text: "2", state: "cancelled", transforms: [ "", "" ], opacities: [ "1", "0" ] } ]
    liftEffect unmount
    liftEffect restore

  it "finishes at once where there is no Element.animate" do
    liftEffect resetBody
    fh <- liftEffect $ fakeHost 0.0
    items <- liftEffect $ signalSource [ 1, 2 ]
    unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ withLeave (leaveWith fadeOut opts) $ each identity items.signal li ]
    liftEffect $ items.putT1 [ 1 ]
    liftEffect (textsOf "li") >>= shouldEqual [ "1" ]
    liftEffect unmount

  it "flipMoves slides moved rows from where they were" do
    liftEffect resetBody
    restoreRects <- liftEffect stubRects
    restore <- liftEffect stubAnimate
    fh <- liftEffect $ fakeHost 0.0
    items <- liftEffect $ signalSource [ 1, 2, 3 ]
    unmount <- liftEffect $ mountOn fh $ element_ "ul" [] [ flipMoves opts $ each identity items.signal li ]
    liftEffect $ items.putT1 [ 3, 1, 2 ]
    liftEffect animationLog >>= shouldEqual
      [ { text: "1", state: "running", transforms: [ "translate(0.0px, -10.0px)", "none" ], opacities: [ "", "" ] }
      , { text: "2", state: "running", transforms: [ "translate(0.0px, -10.0px)", "none" ], opacities: [ "", "" ] }
      , { text: "3", state: "running", transforms: [ "translate(0.0px, 20.0px)", "none" ], opacities: [ "", "" ] }
      ]
    -- A new move cancels the running one first.
    liftEffect $ items.putT1 [ 1, 2, 3 ]
    log <- liftEffect animationLog
    (_.state <$> log) `shouldEqual` [ "cancelled", "cancelled", "cancelled", "running", "running", "running" ]
    liftEffect unmount
    liftEffect restore
    liftEffect restoreRects

  it "crossfade moves a row from one list to the other" do
    liftEffect resetBody
    restoreRects <- liftEffect stubRects
    restore <- liftEffect stubAnimate
    fh <- liftEffect $ fakeHost 0.0
    left <- liftEffect $ signalSource [ 1, 2 ]
    right <- liftEffect $ signalSource [ 3 ]
    unmount <- liftEffect $ mountOn fh $ crossfade opts \{ send, receive } -> element_ "div" []
      [ element_ "ul" [] [ each identity left.signal \s -> send s (li s) ]
      , element_ "ol" [] [ each identity right.signal \s -> receive s (li s) ]
      ]
    liftEffect $ batch do
      left.putT1 [ 1 ]
      right.putT1 [ 2, 3 ]
    -- The entering row is hidden while both wait a frame for their counterpart.
    liftEffect animationLog >>= shouldEqual []
    liftEffect (styleOf "ol li:nth-child(1)" "opacity") >>= shouldEqual "0"
    liftEffect $ fh.advance 16.0
    liftEffect (styleOf "ol li:nth-child(1)" "opacity") >>= shouldEqual ""
    liftEffect animationLog >>= shouldEqual
      [ { text: "2", state: "running", transforms: [ "none", "translate(0.0px, -10.0px) scale(1.0, 1.0)" ], opacities: [ "1", "0" ] }
      , { text: "2", state: "running", transforms: [ "translate(0.0px, 10.0px) scale(1.0, 1.0)", "none" ], opacities: [ "0", "1" ] }
      ]
    liftEffect finishAll
    settle
    liftEffect (textsOf "li") >>= shouldEqual [ "1", "2", "3" ]
    -- A row with no counterpart fades.
    liftEffect $ left.putT1 []
    liftEffect $ fh.advance 16.0
    log <- liftEffect animationLog
    (_.opacities <$> Array.drop 2 log) `shouldEqual` [ [ "1", "0" ] ]
    liftEffect unmount
    liftEffect restore
    liftEffect restoreRects

  describe "viewTransition" do
    it "runs the update as a batch where there is no startViewTransition" do
      s <- liftEffect $ signalSource 0
      liftEffect $ viewTransition (s.putT1 1)
      pure unit

    it "runs the update inside startViewTransition" do
      calls <- liftEffect $ Ref.new 0
      restore <- liftEffect $ stubViewTransition (Ref.modify_ (_ + 1) calls)
      seen <- liftEffect $ Ref.new 0
      liftEffect $ viewTransition (Ref.write 7 seen)
      liftEffect (Ref.read calls) >>= shouldEqual 1
      liftEffect (Ref.read seen) >>= shouldEqual 7
      liftEffect restore
