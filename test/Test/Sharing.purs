module Test.Sharing (spec) where

import Prelude

import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Effect.Unsafe (unsafePerformEffect)
import Screamer.Event as Event
import Screamer.EventSource (eventSource)
import Screamer.Owned (hold, runOwned)
import Test.Event (observeE)
import Test.Observe (observe)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Sharing" do
  it "one stateful node observed by two effects steps once per occurrence" do
    steps <- liftEffect $ Ref.new 0
    src <- liftEffect eventSource
    let
      counted a b = unsafePerformEffect (Ref.modify_ (_ + 1) steps $> (a + b))
      total = Event.fold counted 0 src.event
    o1 <- liftEffect $ observe total
    o2 <- liftEffect $ observe total
    liftEffect $ src.fire 1
    liftEffect $ src.fire 2
    liftEffect o1.trace >>= shouldEqual [ 0, 1, 3 ]
    liftEffect o2.trace >>= shouldEqual [ 0, 1, 3 ]
    liftEffect (Ref.read steps) >>= shouldEqual 2
    liftEffect (o1.stop *> o2.stop)

  it "two evaluations of the same expression are two nodes that diverge" do
    src <- liftEffect eventSource
    let total _ = Event.fold (+) 0 src.event
    o1 <- liftEffect $ observe (total unit)
    liftEffect $ src.fire 1
    o2 <- liftEffect $ observe (total unit)
    liftEffect $ src.fire 2
    liftEffect o1.trace >>= shouldEqual [ 0, 1, 3 ]
    liftEffect o2.trace >>= shouldEqual [ 0, 2 ]
    liftEffect (o1.stop *> o2.stop)

  it "an unheld fold pauses while nothing observes it" do
    src <- liftEffect eventSource
    let total = Event.fold (+) 0 src.event
    o1 <- liftEffect $ observe total
    liftEffect (src.fire 1 *> o1.stop *> src.fire 10)
    o2 <- liftEffect $ observe total
    liftEffect $ src.fire 100
    liftEffect o2.trace >>= shouldEqual [ 1, 101 ]
    liftEffect o2.stop

  it "hold keeps a fold stepping across observer churn" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned $ hold (Event.fold (+) 0 src.event)
    o1 <- liftEffect $ observe r.value
    liftEffect (src.fire 1 *> o1.stop *> src.fire 10)
    o2 <- liftEffect $ observe r.value
    liftEffect $ src.fire 100
    liftEffect o2.trace >>= shouldEqual [ 11, 111 ]
    liftEffect (o2.stop *> r.dispose)

  it "Event.hold keeps a stateful event stepping across observer churn" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned $ Event.hold (Event.take 2 src.event)
    o1 <- liftEffect $ observeE r.value
    liftEffect (src.fire 1 *> o1.stop *> src.fire 2)
    o2 <- liftEffect $ observeE r.value
    liftEffect $ src.fire 3
    liftEffect o2.trace >>= shouldEqual []
    liftEffect (o2.stop *> r.dispose)
    -- Unheld, the paused `take` misses 2 and passes 3.
    o3 <- liftEffect $ observeE (Event.take 2 src.event)
    liftEffect (src.fire 4 *> src.fire 5 *> src.fire 6)
    liftEffect o3.trace >>= shouldEqual [ 4, 5 ]
    liftEffect o3.stop
