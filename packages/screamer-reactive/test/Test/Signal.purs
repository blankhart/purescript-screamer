module Test.Signal (spec) where

import Prelude

import Data.Array as Array
import Data.Array.NonEmpty as NonEmpty
import Data.Foldable (for_, traverse_)
import Data.Int (even)
import Data.Maybe (Maybe(..))
import Data.Traversable (for)
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Event as Event
import Screamer.Owned (Owned, runOwned)
import Screamer.Signal (Signal, dropRepeats, merge, read, sampleManyWith)
import Screamer.Source (SignalSource, batch, signalSource)
import Screamer.Test (observe)
import Test.QuickCheck.Gen (Gen, arrayOf, chooseInt, randomSample', vectorOf)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (fail, shouldEqual)

-- | Three signal sources.
type Chans = { a :: Signal Int, b :: Signal Int, c :: Signal Int }

-- | Initial values, then batches of writes. Each batch writes a signal source at
-- | most once, so a signal source's value changes exactly when its version does.
type Script =
  { initial :: Array Int
  , batches :: Array (Array { chan :: Int, value :: Int })
  , k :: Int
  , m :: Int
  }

genScript :: Gen Script
genScript = do
  initial <- vectorOf 3 (chooseInt 0 5)
  batches <- arrayOf do
    n <- chooseInt 1 3
    chans <- Array.nub <$> vectorOf n (chooseInt 0 2)
    for chans \chan -> { chan, value: _ } <$> chooseInt 0 5
  k <- chooseInt 1 4
  m <- chooseInt (-3) 3
  pure { initial, batches, k, m }

-- | Make both sides on the same signal sources, each in a scope of its own,
-- | observe them while running the script, and compare the traces of values
-- | shown. Consecutive repeats are dropped: a merge reports every step, so an
-- | observer of a merge can be shown the same value twice where the other
-- | side's observer is not.
law :: forall a. Eq a => Show a => (Script -> Chans -> Owned (Signal a)) -> (Script -> Chans -> Owned (Signal a)) -> Script -> Effect Unit
law lhs rhs script = do
  chans <- for (Array.range 0 2) \i -> signalSource (Array.index script.initial i # fromMaybe0)
  let
    sig i = case Array.index chans i of
      Just ch -> ch.signal
      Nothing -> pure 0
    cs = { a: sig 0, b: sig 1, c: sig 2 }
  ls <- runOwned (lhs script cs)
  rs <- runOwned (rhs script cs)
  l <- observe ls.value
  r <- observe rs.value
  for_ script.batches \writes -> batch do
    for_ writes \{ chan, value } -> for_ (Array.index chans chan) \ch -> ch.put value
  lt <- dedup <$> l.trace
  rt <- dedup <$> r.trace
  l.stop
  r.stop
  ls.dispose
  rs.dispose
  when (lt /= rt) do
    fail $ "traces differ for " <> show script <> ": " <> show lt <> " /= " <> show rt
  where
  dedup = map NonEmpty.head <<< Array.group
  fromMaybe0 = case _ of
    Just x -> x
    Nothing -> 0

checkLaw :: forall a. Eq a => Show a => (Script -> Chans -> Signal a) -> (Script -> Chans -> Signal a) -> Effect Unit
checkLaw lhs rhs = checkOwnedLaw (\p s -> pure (lhs p s)) (\p s -> pure (rhs p s))

checkOwnedLaw :: forall a. Eq a => Show a => (Script -> Chans -> Owned (Signal a)) -> (Script -> Chans -> Owned (Signal a)) -> Effect Unit
checkOwnedLaw lhs rhs = do
  scripts <- randomSample' 200 genScript
  traverse_ (law lhs rhs) scripts

spec :: Spec Unit
spec = describe "Screamer.Signal" do
  describe "Functor laws on traces" do
    it "identity" $ liftEffect $ checkLaw (\_ s -> map identity s.a) (\_ s -> s.a)
    it "composition" $ liftEffect $ checkLaw
      (\p s -> map (f p <<< g p) s.a)
      (\p s -> map (f p) (map (g p) s.a))

  describe "Applicative laws on traces" do
    it "identity" $ liftEffect $ checkLaw (\_ s -> pure identity <*> s.a) (\_ s -> s.a)
    it "composition" $ liftEffect $ checkLaw
      (\_ s -> pure (<<<) <*> u s <*> v s <*> s.c)
      (\_ s -> u s <*> (v s <*> s.c))
    it "homomorphism" $ liftEffect $ checkLaw
      (\p _ -> pure (f p) <*> pure p.k)
      (\p _ -> pure (f p p.k))
    it "interchange" $ liftEffect $ checkLaw
      (\p s -> u s <*> pure p.m)
      (\p s -> pure (_ $ p.m) <*> u s)

  describe "Monad laws on traces" do
    it "left identity" $ liftEffect $ checkLaw
      (\p s -> pure p.k >>= kf s)
      (\p s -> kf s p.k)
    it "right identity" $ liftEffect $ checkLaw
      (\_ s -> s.a >>= pure)
      (\_ s -> s.a)
    it "associativity" $ liftEffect $ checkLaw
      (\_ s -> (s.a >>= kf s) >>= kg s)
      (\_ s -> s.a >>= \x -> kf s x >>= kg s)
    -- A fold can only be made in `Owned`, so the inner function can refer to
    -- a fold that exists but cannot start a new one.
    it "associativity with a stateful inner signal" $ liftEffect $ checkOwnedLaw
      (\_ s -> kfold s <#> \t -> (s.a >>= ksum t) >>= kg s)
      (\_ s -> kfold s <#> \t -> s.a >>= \x -> ksum t x >>= kg s)
    it "associativity with a non-injective function and a stateful inner signal" $ liftEffect $ checkOwnedLaw
      (\_ s -> kfold s <#> \t -> (s.a >>= kmod) >>= ktens t)
      (\_ s -> kfold s <#> \t -> s.a >>= \x -> kmod x >>= ktens t)

  describe "merge" do
    it "is associative on traces" $ liftEffect $ checkOwnedLaw
      (\_ s -> merge s.a s.b >>= \ab -> merge ab s.c)
      (\_ s -> merge s.b s.c >>= \bc -> merge s.a bc)
    -- An injective function keeps the law under equality cutoff: a
    -- non-injective one can hide a left change that the merge on the left
    -- side still prefers.
    it "map distributes over merge for injective functions" $ liftEffect $ checkOwnedLaw
      (\p s -> map (f p) <$> merge s.a s.b)
      (\p s -> merge (f p <$> s.a) (f p <$> s.b))

  describe "lifted Semigroup and Monoid" do
    it "appends current values" do
      x <- liftEffect $ signalSource "a"
      y <- liftEffect $ signalSource "b"
      o <- liftEffect $ observe (x.signal <> y.signal <> mempty)
      liftEffect $ y.put "c"
      liftEffect o.trace >>= shouldEqual [ "ab", "ac" ]

  describe "sampleManyWith" do
    it "samples the first record's fields and tracks the second's" do
      x <- liftEffect $ signalSource 1
      y <- liftEffect $ signalSource 10
      let s = sampleManyWith { x: x.signal } { y: y.signal } \r -> r.x + r.y
      o <- liftEffect $ observe s
      liftEffect $ x.put 2
      liftEffect $ y.put 20
      liftEffect $ x.put 3
      liftEffect o.trace >>= shouldEqual [ 11, 22 ]
      liftEffect (read s) >>= shouldEqual 22

  describe "dropRepeats" do
    it "suppresses structurally equal records" do
      ch :: SignalSource { n :: Int } <- liftEffect $ signalSource { n: 1 }
      o <- liftEffect $ observe (dropRepeats ch.signal)
      raw <- liftEffect $ observe ch.signal
      liftEffect $ ch.put { n: 1 }
      liftEffect $ ch.put { n: 2 }
      liftEffect $ ch.put { n: 2 }
      liftEffect o.trace >>= shouldEqual [ { n: 1 }, { n: 2 } ]
      liftEffect (Array.length <$> raw.trace) >>= shouldEqual 4

  where
  f p x = x * p.k + p.m
  g p x = x * 2 - p.m
  u s = map (\k x -> x + k) s.a
  v s = map (\k x -> x * k) s.b
  kf s x = if even x then map (_ + x) s.b else s.c
  kg s y = if y > 3 then map (_ - y) s.a else s.b
  kfold s = Event.fold (\y acc -> acc + y) 0 (Event.changes s.b)
  ksum t x = map (_ + x) t
  kmod x = pure (x `mod` 2)
  ktens t y = (\acc -> acc * 10 + y) <$> t
