module Test.Sharing (spec) where

import Prelude

import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Effect.Unsafe (unsafePerformEffect)
import Screamer.Event (fold) as Event
import Screamer.Event.Extra (take) as Event
import Screamer.Owned (runOwned)
import Screamer.Signal (read)
import Screamer.Source (eventSource)
import Screamer.Test (observe, observeE)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Sharing" do
  it "one stateful node observed by two effects steps once per occurrence" do
    steps <- liftEffect $ Ref.new 0
    src <- liftEffect eventSource
    let counted a b = unsafePerformEffect (Ref.modify_ (_ + 1) steps $> (a + b))
    r <- liftEffect $ runOwned (Event.fold counted 0 src.event)
    o1 <- liftEffect $ observe r.value
    o2 <- liftEffect $ observe r.value
    liftEffect $ src.fire 1
    liftEffect $ src.fire 2
    liftEffect o1.trace >>= shouldEqual [ 0, 1, 3 ]
    liftEffect o2.trace >>= shouldEqual [ 0, 1, 3 ]
    liftEffect (Ref.read steps) >>= shouldEqual 2
    liftEffect (o1.stop *> o2.stop *> r.dispose)

  it "every subscriber sees the same state, whenever it subscribes" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Event.fold (+) 0 src.event)
    o1 <- liftEffect $ observe r.value
    liftEffect $ src.fire 1
    o2 <- liftEffect $ observe r.value
    liftEffect $ src.fire 2
    liftEffect o1.trace >>= shouldEqual [ 0, 1, 3 ]
    liftEffect o2.trace >>= shouldEqual [ 1, 3 ]
    liftEffect (o1.stop *> o2.stop *> r.dispose)

  it "running the action twice makes two nodes, each starting when it runs" do
    src <- liftEffect eventSource
    let total = Event.fold (+) 0 src.event
    r1 <- liftEffect $ runOwned total
    liftEffect $ src.fire 1
    r2 <- liftEffect $ runOwned total
    liftEffect $ src.fire 2
    liftEffect (read r1.value) >>= shouldEqual 3
    liftEffect (read r2.value) >>= shouldEqual 2
    liftEffect (r1.dispose *> r2.dispose)

  it "a fold steps while nothing observes it" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Event.fold (+) 0 src.event)
    o1 <- liftEffect $ observe r.value
    liftEffect (src.fire 1 *> o1.stop *> src.fire 10)
    o2 <- liftEffect $ observe r.value
    liftEffect $ src.fire 100
    liftEffect o2.trace >>= shouldEqual [ 11, 111 ]
    liftEffect (o2.stop *> r.dispose)

  it "a stateful event counts from when it is made, not from when it is observed" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Event.take 2 src.event)
    liftEffect $ src.fire 1
    o1 <- liftEffect $ observeE r.value
    liftEffect (src.fire 2 *> o1.stop *> src.fire 3)
    o2 <- liftEffect $ observeE r.value
    liftEffect $ src.fire 4
    liftEffect o1.trace >>= shouldEqual [ 2 ]
    liftEffect o2.trace >>= shouldEqual []
    liftEffect (o2.stop *> r.dispose)

  it "a stateful node stops when its scope is disposed" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned (Event.fold (+) 0 src.event)
    liftEffect (src.fire 1 *> r.dispose *> src.fire 10)
    liftEffect (read r.value) >>= shouldEqual 1
