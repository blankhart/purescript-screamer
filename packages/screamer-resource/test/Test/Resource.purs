module Test.Resource (spec) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Time.Duration (Milliseconds(..))
import Effect.Aff (Aff, delay, effectCanceler, makeAff)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Effect.Ref as Ref
import Screamer.Owned (runOwned)
import Screamer.Resource (Remote(..), resource)
import Screamer.Signal (readT0)
import Screamer.Source (signalSource)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Screamer.Resource" do
  it "never shows a stale result when the input changes mid-flight" do
    pending <- liftEffect $ Ref.new []
    killed <- liftEffect $ Ref.new []
    let
      request :: Int -> Aff String
      request n = makeAff \cb -> do
        Ref.modify_ (_ <> [ { n, cb } ]) pending
        pure $ effectCanceler (Ref.modify_ (_ <> [ n ]) killed)
      resolve n v = Ref.read pending >>= \ps ->
        for_ (Array.find (\p -> p.n == n) ps) \p -> p.cb (Right v)
    input <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned (resource input.signal request)
    yield
    liftEffect (readT0 r.value) >>= shouldEqual Loading
    liftEffect $ input.putT1 2
    yield
    liftEffect $ resolve 1 "one"
    yield
    liftEffect (readT0 r.value) >>= shouldEqual Loading
    liftEffect $ resolve 2 "two"
    yield
    liftEffect (readT0 r.value) >>= shouldEqual (Loaded "two")
    liftEffect (Ref.read killed) >>= shouldEqual [ 1 ]
    liftEffect $ input.putT1 3
    yield
    liftEffect r.dispose
    yield
    liftEffect $ resolve 3 "three"
    yield
    liftEffect (readT0 r.value) >>= shouldEqual Loading
    liftEffect (Ref.read killed) >>= shouldEqual [ 1, 3 ]

  it "reports a failed request" do
    input <- liftEffect $ signalSource unit
    r <- liftEffect $ runOwned (resource input.signal \_ -> makeAff \cb -> cb (Left (error "boom")) $> mempty)
    yield
    liftEffect (readT0 r.value) >>= shouldEqual (Failed (error "boom") :: Remote Unit)
    liftEffect r.dispose

-- | Let fibers launched from inside the test's own fiber run: the Aff
-- | scheduler starts them once the current fiber yields.
yield :: Aff Unit
yield = delay (Milliseconds 0.0)
