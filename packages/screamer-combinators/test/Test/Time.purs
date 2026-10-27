module Test.Time (spec) where

import Prelude

import Data.DateTime.Instant (unInstant)
import Data.Either (Either(..))
import Data.Foldable (traverse_)
import Data.Newtype (un)
import Data.Time.Duration (Milliseconds(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Owned (runOwned)
import Screamer.Runtime (Stats, readStats)
import Screamer.Signal (readT0)
import Screamer.Source (batch, eventSource, signalSource)
import Screamer.Time as Time
import Screamer.Test (observe, observeE)
import Screamer.Test.Clock as Fake
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)

ms :: Number -> Milliseconds
ms = Milliseconds

spec :: Spec Unit
spec = before_ (liftEffect (Fake.installFakeTimers *> Fake.installFakeFrames)) $ after_ (liftEffect (Fake.uninstallFakeTimers *> Fake.uninstallFakeFrames)) $ describe "Screamer.Time" do
  sources
  it "debounce fires the last occurrence once after a burst" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Time.debounce (ms 100.0) src.event)
    o <- liftEffect $ observeE r.value
    liftEffect do
      src.fireT1 1
      Fake.advance 50.0
      src.fireT1 2
      Fake.advance 50.0
      src.fireT1 3
      Fake.advance 99.0
    liftEffect o.trace >>= shouldEqual []
    liftEffect $ Fake.advance 1.0
    liftEffect o.trace >>= shouldEqual [ 3 ]
    liftEffect $ Fake.advance 500.0
    liftEffect o.trace >>= shouldEqual [ 3 ]
    liftEffect (o.stop *> r.dispose)

  it "debounceSignal holds the last settled value, updated in one round" do
    s <- liftEffect $ signalSource "a"
    r <- liftEffect $ runOwned (Time.debounceSignal (ms 100.0) s.signal)
    o <- liftEffect $ observe r.value
    liftEffect do
      s.putT1 "ab"
      Fake.advance 50.0
      s.putT1 "abc"
      Fake.advance 100.0
    liftEffect o.trace >>= shouldEqual [ "a", "abc" ]
    liftEffect (o.stop *> r.dispose)

  it "throttle passes the leading edge and fires the trailing one" do
    src <- liftEffect eventSource
    lead <- liftEffect $ runOwned (Time.throttle { leading: true, trailing: false } (ms 100.0) src.event)
    trail <- liftEffect $ runOwned (Time.throttle { leading: false, trailing: true } (ms 100.0) src.event)
    both <- liftEffect $ runOwned (Time.throttle { leading: true, trailing: true } (ms 100.0) src.event)
    ol <- liftEffect $ observeE lead.value
    ot <- liftEffect $ observeE trail.value
    ob <- liftEffect $ observeE both.value
    liftEffect do
      src.fireT1 1
      Fake.advance 30.0
      src.fireT1 2
      Fake.advance 30.0
      src.fireT1 3
      Fake.advance 100.0
      Fake.advance 300.0
      src.fireT1 4
      Fake.advance 300.0
    liftEffect ol.trace >>= shouldEqual [ 1, 4 ]
    liftEffect ot.trace >>= shouldEqual [ 3, 4 ]
    liftEffect ob.trace >>= shouldEqual [ 1, 3, 4 ]
    liftEffect (ol.stop *> ot.stop *> ob.stop *> lead.dispose *> trail.dispose *> both.dispose)

  it "audit fires the latest occurrence an interval after the first" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Time.audit (ms 100.0) src.event)
    o <- liftEffect $ observeE r.value
    liftEffect do
      src.fireT1 1
      Fake.advance 60.0
      src.fireT1 2
      Fake.advance 60.0
      src.fireT1 3
      Fake.advance 100.0
    liftEffect o.trace >>= shouldEqual [ 2, 3 ]
    liftEffect (o.stop *> r.dispose)

  it "sampleEvery reads the signal each interval" do
    s <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned (Time.sampleEvery (ms 100.0) s.signal)
    o <- liftEffect $ observeE r.value
    liftEffect do
      Fake.advance 100.0
      s.putT1 2
      Fake.advance 100.0
      Fake.advance 100.0
    liftEffect o.trace >>= shouldEqual [ 1, 2, 2 ]
    liftEffect (o.stop *> r.dispose)
    liftEffect Fake.pendingTimers >>= shouldEqual 0

  it "delay preserves order, and disposing mid-wait cancels what is pending" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Time.delay (ms 100.0) src.event)
    o <- liftEffect $ observeE r.value
    liftEffect do
      batch (src.fireT1 1 *> src.fireT1 2)
      Fake.advance 50.0
      src.fireT1 3
      Fake.advance 50.0
    liftEffect o.trace >>= shouldEqual [ 1, 2 ]
    liftEffect Fake.pendingTimers >>= shouldEqual 1
    liftEffect r.dispose
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    liftEffect $ Fake.advance 500.0
    liftEffect o.trace >>= shouldEqual [ 1, 2 ]
    liftEffect o.stop

  it "timeout reports each silence of the interval" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Time.timeout (ms 100.0) src.event)
    o <- liftEffect $ observeE r.value
    liftEffect do
      Fake.advance 100.0
      Fake.advance 500.0
      src.fireT1 "a"
      Fake.advance 50.0
      src.fireT1 "b"
      Fake.advance 100.0
    liftEffect o.trace >>= shouldEqual [ Left unit, Right "a", Right "b", Left unit ]
    liftEffect (o.stop *> r.dispose)

  it "onFrame coalesces occurrences to the next frame" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Time.onFrame src.event)
    o <- liftEffect $ observeE r.value
    liftEffect $ traverse_ src.fireT1 [ 1, 2, 3 ]
    liftEffect o.trace >>= shouldEqual []
    liftEffect $ Fake.frame 16.0
    liftEffect $ src.fireT1 4
    liftEffect $ Fake.frame 32.0
    liftEffect o.trace >>= shouldEqual [ 3, 4 ]
    liftEffect (o.stop *> r.dispose)
    liftEffect Fake.pendingFrames >>= shouldEqual 0

  it "bufferFor fires each interval's occurrences and drops what is held on dispose" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Time.bufferFor (ms 100.0) src.event)
    o <- liftEffect $ observeE r.value
    liftEffect do
      traverse_ src.fireT1 [ 1, 2 ]
      Fake.advance 100.0
      Fake.advance 100.0
      src.fireT1 3
      Fake.advance 50.0
    liftEffect o.trace >>= shouldEqual [ [ 1, 2 ] ]
    liftEffect r.dispose
    liftEffect $ Fake.advance 500.0
    liftEffect o.trace >>= shouldEqual [ [ 1, 2 ] ]
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    liftEffect o.stop

  it "releases every timer, effect and scope on dispose" do
    before <- liftEffect readStats
    src <- liftEffect eventSource
    s <- liftEffect $ signalSource 0
    r <- liftEffect $ runOwned do
      _ <- Time.debounce (ms 10.0) src.event
      _ <- Time.throttle { leading: true, trailing: true } (ms 10.0) src.event
      _ <- Time.audit (ms 10.0) src.event
      _ <- Time.delay (ms 10.0) src.event
      _ <- Time.timeout (ms 10.0) src.event
      _ <- Time.onFrame src.event
      _ <- Time.bufferFor (ms 10.0) src.event
      _ <- Time.sampleEvery (ms 10.0) s.signal
      Time.debounceSignal (ms 10.0) s.signal
    liftEffect $ src.fireT1 1
    liftEffect r.dispose
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    liftEffect Fake.pendingFrames >>= shouldEqual 0
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }
    liftEffect (readT0 r.value) >>= shouldEqual 0

-- | Nothing live is left over from `before`: no effect, scope or link.
shouldBeReleasedSince :: Stats -> Aff Unit
shouldBeReleasedSince before = do
  after <- liftEffect readStats
  { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
    `shouldEqual` { effects: 0, scopes: 0, links: 0 }

sources :: Spec Unit
sources = describe "sources" do
  it "clock updates the time each interval and stops on dispose" do
    before <- liftEffect readStats
    r <- liftEffect $ runOwned (Time.clock (ms 100.0))
    o <- liftEffect $ observe r.value
    let millis = map (un Milliseconds <<< unInstant) (readT0 r.value)
    t0 <- liftEffect millis
    liftEffect $ Fake.advance 250.0
    t1 <- liftEffect millis
    (t1 - t0) `shouldEqual` 200.0
    liftEffect (o.stop *> r.dispose)
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    liftEffect $ Fake.advance 1000.0
    liftEffect millis >>= shouldEqual t1
    shouldBeReleasedSince before

  it "interval fires each interval and stops on dispose" do
    before <- liftEffect readStats
    r <- liftEffect $ runOwned (Time.interval (ms 100.0))
    o <- liftEffect $ observeE r.value
    liftEffect $ Fake.advance 250.0
    liftEffect o.trace >>= shouldEqual [ unit, unit ]
    liftEffect (o.stop *> r.dispose)
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    shouldBeReleasedSince before

  it "after fires once, and not at all when disposed first" do
    before <- liftEffect readStats
    a <- liftEffect $ runOwned (Time.after (ms 50.0))
    b <- liftEffect $ runOwned (Time.after (ms 50.0))
    oa <- liftEffect $ observeE a.value
    ob <- liftEffect $ observeE b.value
    liftEffect b.dispose
    liftEffect $ Fake.advance 200.0
    liftEffect oa.trace >>= shouldEqual [ unit ]
    liftEffect ob.trace >>= shouldEqual []
    liftEffect (oa.stop *> ob.stop *> a.dispose)
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    shouldBeReleasedSince before

  it "frames follows the frame timestamps and stops on dispose" do
    before <- liftEffect readStats
    r <- liftEffect $ runOwned Time.frames
    o <- liftEffect $ observeE r.value
    liftEffect do
      Fake.frame 16.0
      Fake.frame 33.0
    liftEffect o.trace >>= shouldEqual [ 16.0, 33.0 ]
    liftEffect (o.stop *> r.dispose)
    liftEffect Fake.pendingFrames >>= shouldEqual 0
    liftEffect $ Fake.frame 50.0
    liftEffect o.trace >>= shouldEqual [ 16.0, 33.0 ]
    shouldBeReleasedSince before

  it "frameLoop runs while its step returns true, then requests no frame" do
    before <- liftEffect readStats
    seen <- liftEffect $ Ref.new []
    let step ts = Ref.modify_ (_ <> [ ts ]) seen *> pure (ts < 40.0)
    r <- liftEffect $ runOwned (Time.frameLoop step)
    liftEffect Fake.pendingFrames >>= shouldEqual 0
    liftEffect do
      r.value.start
      r.value.start
    liftEffect Fake.pendingFrames >>= shouldEqual 1
    liftEffect do
      Fake.frame 16.0
      Fake.frame 33.0
      Fake.frame 50.0
    liftEffect (Ref.read seen) >>= shouldEqual [ 16.0, 33.0, 50.0 ]
    liftEffect Fake.pendingFrames >>= shouldEqual 0
    -- It can be started again, and stopped.
    liftEffect r.value.start
    liftEffect r.value.stop
    liftEffect Fake.pendingFrames >>= shouldEqual 0
    liftEffect r.value.start
    liftEffect r.dispose
    liftEffect Fake.pendingFrames >>= shouldEqual 0
    shouldBeReleasedSince before
