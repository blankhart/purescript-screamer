module Test.Motion.Value (spec) where

import Prelude

import Data.Maybe (Maybe(..))
import Data.Time.Duration (Milliseconds(..))
import Effect.Class (liftEffect)
import Screamer.Context (provide)
import Screamer.Host (withHost)
import Screamer.Motion.ReducedMotion (reducedMotionKey)
import Screamer.Motion.Value (defaultSpring, linear, sprung, tween, tweened)
import Screamer.Owned (runOwned)
import Screamer.Signal (readT0)
import Screamer.Source (signalSource)
import Screamer.Test (observe)
import Screamer.Test.Clock (fakeHost)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Screamer.Motion.Value" do
  it "tweened eases to a target, then requests no frame" do
    fh <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fh.host $ tweened { duration: Milliseconds 100.0, easing: linear } 0.0
    o <- liftEffect $ observe r.value.signal
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect $ r.value.set 10.0
    -- The first frame starts the clock.
    liftEffect $ fh.advance 16.0
    liftEffect $ fh.advance 50.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 4.8
    liftEffect $ fh.advance 100.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 10.0
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect o.trace >>= shouldEqual [ 0.0, 1.6, 3.2, 4.8, 6.4, 8.0, 9.6, 10.0 ]
    liftEffect (o.stop *> r.dispose)

  it "a new target starts from the value shown" do
    fh <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fh.host $ tweened { duration: Milliseconds 160.0, easing: linear } 0.0
    liftEffect $ r.value.set 16.0
    liftEffect $ fh.advance 96.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 8.0
    liftEffect $ r.value.set 0.0
    liftEffect $ fh.advance 16.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 8.0
    liftEffect $ fh.advance 80.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 4.0
    liftEffect $ fh.advance 200.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 0.0
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect r.dispose

  it "jump moves at once and stops the loop" do
    fh <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fh.host $ tweened { duration: Milliseconds 100.0, easing: linear } 0.0
    liftEffect $ r.value.set 10.0
    liftEffect $ fh.advance 48.0
    liftEffect $ r.value.jump 3.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 3.0
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect r.dispose

  it "jumps when motion is reduced" do
    fh <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fh.host $ provide reducedMotionKey (Just true) $
      tweened { duration: Milliseconds 100.0, easing: linear } 0.0
    liftEffect $ r.value.set 10.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 10.0
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect r.dispose

  it "tween follows a target signal" do
    fh <- liftEffect $ fakeHost 0.0
    target <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned $ withHost fh.host $ tween { duration: Milliseconds 100.0, easing: linear } target.signal
    liftEffect (readT0 r.value) >>= shouldEqual 1
    liftEffect $ target.putT1 11
    liftEffect $ fh.advance 66.0
    liftEffect (readT0 r.value) >>= shouldEqual 6
    liftEffect $ fh.advance 100.0
    liftEffect (readT0 r.value) >>= shouldEqual 11
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect r.dispose

  it "a spring settles on its target, then requests no frame" do
    fh <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fh.host $ sprung defaultSpring 0.0
    liftEffect $ r.value.set 100.0
    liftEffect $ fh.advance 160.0
    moving <- liftEffect $ readT0 r.value.signal
    (moving > 0.0 && moving < 150.0) `shouldEqual` true
    liftEffect $ fh.advance 10000.0
    liftEffect (readT0 r.value.signal) >>= shouldEqual 100.0
    liftEffect fh.scheduled >>= shouldEqual 0
    liftEffect r.dispose

  it "disposal stops the frames" do
    fh <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fh.host $ sprung defaultSpring 0.0
    liftEffect $ r.value.set 1.0
    liftEffect r.dispose
    liftEffect fh.scheduled >>= shouldEqual 0
