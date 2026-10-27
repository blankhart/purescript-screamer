module Test.Owned (spec) where

import Prelude

import Data.Either (Either(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Exception (message, try)
import Effect.Ref as Ref
import Screamer.Owned (child, onCleanup, runOwned)
import Screamer.Runtime (readStats)
import Screamer.Event as Event
import Screamer.Signal (readT0, subscribe)
import Screamer.Source (signalSource)
import Screamer.Test (withoutStrict)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (fail, shouldEqual)

record :: Ref.Ref (Array String) -> String -> Effect Unit
record log s = Ref.modify_ (_ <> [ s ]) log

spec :: Spec Unit
spec = describe "Screamer.Owned" do
  it "runs cleanups in reverse order of registration" do
    log <- liftEffect $ Ref.new []
    r <- liftEffect $ runOwned do
      onCleanup (record log "1")
      onCleanup (record log "2")
      onCleanup (record log "3")
    liftEffect r.dispose
    liftEffect (Ref.read log) >>= shouldEqual [ "3", "2", "1" ]

  it "disposes children before the parent's own cleanups" do
    log <- liftEffect $ Ref.new []
    r <- liftEffect $ runOwned do
      onCleanup (record log "parent first")
      _ <- child (onCleanup (record log "child a"))
      onCleanup (record log "parent second")
      _ <- child do
        onCleanup (record log "child b")
        void $ child (onCleanup (record log "grandchild"))
      pure unit
    liftEffect r.dispose
    liftEffect (Ref.read log) >>= shouldEqual
      [ "grandchild", "child b", "child a", "parent second", "parent first" ]

  it "disposes idempotently" do
    log <- liftEffect $ Ref.new []
    r <- liftEffect $ runOwned do
      c <- child (onCleanup (record log "child"))
      onCleanup (record log "parent")
      pure c
    liftEffect do
      r.value.dispose
      r.value.dispose
      r.dispose
      r.dispose
    liftEffect (Ref.read log) >>= shouldEqual [ "child", "parent" ]

  it "queues a subscriber's writes into the next round and never re-enters it" do
    log <- liftEffect $ Ref.new []
    depth <- liftEffect $ Ref.new 0
    maxDepth <- liftEffect $ Ref.new 0
    a <- liftEffect $ signalSource 0
    b <- liftEffect $ signalSource 0
    r <- liftEffect $ runOwned do
      subscribe a.signal \x -> do
        d <- Ref.modify (_ + 1) depth
        Ref.modify_ (max d) maxDepth
        record log ("a " <> show x)
        b.putT1 (x * 2)
        when (x > 0 && x < 3) (a.putT1 (x + 1))
        record log ("a done " <> show x)
        Ref.modify_ (_ - 1) depth
      subscribe b.signal \y -> record log ("b " <> show y)
    liftEffect $ a.putT1 1
    -- A write from a subscriber is deferred to the start of the next
    -- timestep, so `b` sees each value one timestep after `a`'s subscriber
    -- wrote it, whatever the order the two subscribed in.
    liftEffect (Ref.read log) >>= shouldEqual
      [ "a 0", "a done 0", "b 0"
      , "a 1", "a done 1"
      , "a 2", "a done 2", "b 2"
      , "a 3", "a done 3", "b 4"
      , "b 6"
      ]
    liftEffect (Ref.read maxDepth) >>= shouldEqual 1
    liftEffect r.dispose

  it "surfaces an effect loop as an exception" do
    a <- liftEffect $ signalSource 0
    r <- liftEffect $ runOwned $ subscribe a.signal \x -> when (x > 0) (a.putT1 (x + 1))
    result <- liftEffect $ try (a.putT1 100)
    liftEffect r.dispose
    case result of
      Left e -> unless (contains (Pattern "effect loop") (message e)) $ fail (message e)
      Right _ -> fail "expected an effect loop"

  it "composes two subscribers' modifies in one timestep" do
    a <- liftEffect $ signalSource 0
    n <- liftEffect $ signalSource 1
    seen <- liftEffect $ Ref.new []
    r <- liftEffect $ runOwned do
      subscribe a.signal \x -> when (x > 0) (n.modifyT1 (_ + 1))
      subscribe a.signal \x -> when (x > 0) do
        n.modifyT1 (_ * 10)
        -- Not yet: the writes are deferred to the next timestep.
        readT0 n.signal >>= \v -> Ref.modify_ (_ <> [ v ]) seen
    -- Two subscribers modifying one source warn (SCR002) on purpose.
    liftEffect $ withoutStrict $ a.putT1 1
    liftEffect (readT0 n.signal) >>= shouldEqual 20
    liftEffect (Ref.read seen) >>= shouldEqual [ 1 ]
    liftEffect r.dispose

  it "stops a fold advancing when the child scope that made it is disposed" do
    clicks <- liftEffect $ signalSource 0
    r <- liftEffect $ runOwned $ child (Event.fold (\_ n -> n + 1) 0 (Event.changes clicks.signal))
    let count = r.value.value
    liftEffect $ clicks.putT1 1
    liftEffect $ clicks.putT1 2
    liftEffect (readT0 count) >>= shouldEqual 2
    liftEffect r.value.dispose
    liftEffect $ clicks.putT1 3
    -- A read of the paused fold, which warns (SCR001) on purpose.
    liftEffect (withoutStrict (readT0 count)) >>= shouldEqual 2
    liftEffect r.dispose

  it "leaves nothing live after disposal" do
    before <- liftEffect readStats
    a <- liftEffect $ signalSource 0
    r <- liftEffect $ runOwned do
      subscribe (map (_ + 1) a.signal) \_ -> pure unit
      void $ Event.fold (+) 0 (Event.changes a.signal)
      void $ child (subscribe a.signal \_ -> pure unit)
    liftEffect $ a.putT1 1
    liftEffect r.dispose
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }
