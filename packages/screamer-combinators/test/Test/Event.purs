module Test.Event (spec) where

import Prelude

import Control.Alt ((<|>))
import Control.Alternative (guard)
import Control.Plus (empty)
import Data.Array as Array
import Data.Array.NonEmpty as NonEmpty
import Data.Either (Either(..))
import Data.Filterable (filter, filterMap, partition)
import Data.Foldable (for_, traverse_)
import Data.Maybe (Maybe(..))
import Data.Traversable (for)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Event (Event)
import Screamer.Event (attach, attachWith, changes, dropRepeats, dropRepeatsOn, fold, gate, mapAccum, oneOf, stepper, tag, withPrevious) as Event
import Screamer.Event.Extra (bufferCount, bufferOn, bufferWhile, count, first, leftmost, mergeWith, race, skip, skipWhile, take, takeWhile, zip) as Event
import Screamer.Owned (Owned, runOwned)
import Screamer.Runtime (readStats)
import Screamer.Signal (readT0)
import Screamer.Signal (dropRepeatsOn, withPrevious) as Signal
import Screamer.Signal.Extra (combine, history, withLatest) as Signal
import Screamer.Source (batch, eventSource, signalSource)
import Screamer.Test (observe, observeE, observeOwned, observeOwnedE, withoutStrict)
import Test.QuickCheck.Gen (Gen, arrayOf, chooseInt, randomSample', vectorOf)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (fail, shouldEqual)

-- | Three event sources.
type Srcs = { a :: Event Int, b :: Event Int, c :: Event Int }

-- | Batches of fires; a source may fire several times in one batch.
type Script = Array (Array { src :: Int, value :: Int })

genScript :: Gen Script
genScript = arrayOf do
  n <- chooseInt 1 5
  vectorOf n ({ src: _, value: _ } <$> chooseInt 0 2 <*> chooseInt 0 3)

-- | Observe both sides on the same sources while running the script, and
-- | compare every occurrence they deliver, in order.
law :: forall a. Eq a => Show a => (Srcs -> Event a) -> (Srcs -> Event a) -> Script -> Effect Unit
law lhs rhs script = do
  srcs <- for (Array.range 0 2) \_ -> eventSource
  let
    ev i = case Array.index srcs i of
      Just s -> s.event
      Nothing -> empty
    ss = { a: ev 0, b: ev 1, c: ev 2 }
  l <- observeE (lhs ss)
  r <- observeE (rhs ss)
  for_ script \fires -> batch do
    for_ fires \{ src, value } -> for_ (Array.index srcs src) \s -> s.fireT1 value
  lt <- l.trace
  rt <- r.trace
  l.stop
  r.stop
  when (lt /= rt) do
    fail $ "traces differ for " <> show script <> ": " <> show lt <> " /= " <> show rt

-- | Batches of fires of one source.
genFires :: Gen (Array (Array Int))
genFires = arrayOf do
  n <- chooseInt 1 4
  vectorOf n (chooseInt 0 4)

-- | A stateful operator, made and observed before the first fire, agrees
-- | with a model over the sequence of every occurrence fired.
model :: forall b. Eq b => Show b => (Event Int -> Owned (Event b)) -> (Array Int -> Array b) -> Effect Unit
model op ref = do
  scripts <- randomSample' 200 genFires
  for_ scripts \script -> do
    src <- eventSource
    o <- observeOwnedE (op src.event)
    for_ script \fires -> batch (for_ fires src.fireT1)
    got <- o.trace
    o.stop
    let want = ref (Array.concat script)
    when (got /= want) do
      fail $ "for " <> show script <> ": got " <> show got <> ", want " <> show want

countModel :: Int -> Int -> Array Int -> Array (Array Int)
countModel n step xs = do
  i <- Array.range 0 (Array.length xs - 1)
  guard (i `mod` step == 0 && i + n <= Array.length xs)
  pure (Array.slice i (i + n) xs)

-- | Batches of fires of a data source or a notifier.
type Tagged = Array (Array { notify :: Boolean, value :: Int })

genTagged :: Gen Tagged
genTagged = arrayOf do
  n <- chooseInt 1 4
  vectorOf n ({ notify: _, value: _ } <$> map (_ == 0) (chooseInt 0 2) <*> chooseInt 0 4)

bufferOnModel :: Array { notify :: Boolean, value :: Int } -> Array (Array Int)
bufferOnModel = go [] []
  where
  go acc buf fs = case Array.uncons fs of
    Nothing -> acc
    Just { head, tail }
      | head.notify -> go (acc <> [ buf ]) [] tail
      | otherwise -> go acc (buf <> [ head.value ]) tail

-- | Rounds are batches; a notify toggles the condition, read at the end of
-- | the round. Occurrences of rounds that end open are collected; a round
-- | that ends closed after an open one fires the collection.
bufferWhileModel :: Tagged -> Array (Array Int)
bufferWhileModel script = (Array.foldl step { open: false, buf: [], out: [] } script).out
  where
  step st fires =
    let
      toggles = Array.length (Array.filter _.notify fires)
      open = if toggles `mod` 2 == 1 then not st.open else st.open
      values = map _.value (Array.filter (not <<< _.notify) fires)
    in
      if open then st { open = true, buf = st.buf <> values }
      else if st.open then { open: false, buf: [], out: st.out <> [ st.buf ] }
      else st

checkLaw :: forall a. Eq a => Show a => (Srcs -> Event a) -> (Srcs -> Event a) -> Effect Unit
checkLaw lhs rhs = do
  scripts <- randomSample' 200 genScript
  traverse_ (law lhs rhs) scripts

spec :: Spec Unit
spec = describe "Screamer.Event" do
  describe "laws on traces" do
    it "Functor identity" $ liftEffect $ checkLaw (\s -> map identity s.a) _.a
    it "Functor composition" $ liftEffect $ checkLaw (\s -> map (_ * 2) (map (_ + 1) s.a)) (\s -> map ((_ * 2) <<< (_ + 1)) s.a)
    it "Alt associativity" $ liftEffect $ checkLaw (\s -> (s.a <|> s.b) <|> s.c) (\s -> s.a <|> (s.b <|> s.c))
    it "Alt distributes over map" $ liftEffect $ checkLaw (\s -> map (_ + 1) (s.a <|> s.b)) (\s -> map (_ + 1) s.a <|> map (_ + 1) s.b)
    it "Plus left identity" $ liftEffect $ checkLaw (\s -> empty <|> s.a) _.a
    it "Plus right identity" $ liftEffect $ checkLaw (\s -> s.a <|> empty) _.a
    it "Filterable identity" $ liftEffect $ checkLaw (\s -> filter (const true) s.a) _.a
    it "Filterable composition" $ liftEffect $ checkLaw
      (\s -> filter (_ > 0) (filter (_ < 3) (s.a <|> s.b)))
      (\s -> filter (\x -> x > 0 && x < 3) (s.a <|> s.b))
    it "filterMap Just is identity" $ liftEffect $ checkLaw (\s -> filterMap Just s.a) _.a
    it "partition splits by the predicate" $ liftEffect $ checkLaw
      (\s -> let p = partition (_ > 1) s.a in map (Tuple true) p.yes <|> map (Tuple false) p.no)
      (\s -> map (\x -> Tuple (x > 1) x) s.a)

  describe "transform, filter and accumulate against a model" do
    it "mapAccum" $ liftEffect $ model
      (Event.mapAccum (\a s -> { state: s + a, value: s * 10 + a }) 0)
      (\xs -> Array.zipWith (\s a -> s * 10 + a) (Array.scanl (+) 0 xs # Array.cons 0) xs)
    it "withPrevious" $ liftEffect $ model
      (map (map (\p -> Tuple p.previous p.current)) <<< Event.withPrevious)
      (\xs -> Array.zip xs (Array.drop 1 xs))
    it "dropRepeats" $ liftEffect $ model Event.dropRepeats (map NonEmpty.head <<< Array.group)
    it "dropRepeatsOn" $ liftEffect $ model (Event.dropRepeatsOn (_ `div` 2))
      (map NonEmpty.head <<< Array.groupBy (\x y -> x `div` 2 == y `div` 2))
    it "take" $ liftEffect $ model (Event.take 3) (Array.take 3)
    it "skip" $ liftEffect $ model (Event.skip 2) (Array.drop 2)
    it "takeWhile" $ liftEffect $ model (Event.takeWhile (_ < 3)) (Array.takeWhile (_ < 3))
    it "skipWhile" $ liftEffect $ model (Event.skipWhile (_ < 3)) (Array.dropWhile (_ < 3))
    it "first" $ liftEffect $ model Event.first (Array.take 1)

  describe "transform, filter and accumulate" do
    it "take and skip count from when they are made, observed or not" do
      src <- liftEffect eventSource
      r <- liftEffect $ runOwned do
        t <- Event.take 2 src.event
        s <- Event.skip 2 src.event
        pure (map Left t <|> map Right s)
      o1 <- liftEffect $ observeE r.value
      liftEffect $ src.fireT1 1
      liftEffect o1.stop
      liftEffect $ traverse_ src.fireT1 [ 2, 3 ]
      o2 <- liftEffect $ observeE r.value
      liftEffect $ traverse_ src.fireT1 [ 4, 5 ]
      liftEffect o1.trace >>= shouldEqual [ Left 1 ]
      liftEffect o2.trace >>= shouldEqual [ Right 4, Right 5 ]
      liftEffect (o2.stop *> r.dispose)

    it "count counts occurrences" do
      src <- liftEffect eventSource
      o <- liftEffect $ observeOwned (Event.count src.event)
      liftEffect $ batch (src.fireT1 unit *> src.fireT1 unit)
      liftEffect o.trace >>= shouldEqual [ 0, 2 ]
      liftEffect o.stop

    it "gate passes rounds that end with the condition true" do
      open <- liftEffect $ signalSource false
      src <- liftEffect eventSource
      o <- liftEffect $ observeE (Event.gate open.signal src.event)
      liftEffect $ src.fireT1 1
      liftEffect $ batch (src.fireT1 2 *> open.putT1 true)
      liftEffect $ src.fireT1 3
      liftEffect o.trace >>= shouldEqual [ 2, 3 ]
      liftEffect o.stop

    it "Signal.withPrevious pairs each value with the one before" do
      s <- liftEffect $ signalSource 1
      o <- liftEffect $ observeOwned (Signal.withPrevious 0 s.signal)
      liftEffect $ s.putT1 2
      liftEffect $ s.putT1 3
      liftEffect o.trace >>= shouldEqual [ Tuple 0 1, Tuple 1 2, Tuple 2 3 ]
      liftEffect o.stop

    it "Signal.dropRepeatsOn compares keys" do
      s <- liftEffect $ signalSource 1
      o <- liftEffect $ observeOwned (Signal.dropRepeatsOn (_ `div` 10) s.signal)
      liftEffect $ traverse_ s.putT1 [ 2, 12, 15, 3 ]
      liftEffect o.trace >>= shouldEqual [ 1, 12, 3 ]
      liftEffect o.stop

  describe "combining" do
    it "oneOf agrees with a fold of <|>" $ liftEffect $ checkLaw
      (\s -> Event.oneOf [ s.a, s.b, s.c ])
      (\s -> s.a <|> s.b <|> s.c)
    it "oneOf of maps of one event agrees with <|>" $ liftEffect $ checkLaw
      (\s -> Event.oneOf [ map (_ * 2) s.a, s.a, map (_ + 1) s.b ])
      (\s -> map (_ * 2) s.a <|> s.a <|> map (_ + 1) s.b)
    it "leftmost keeps one input per round, mergeWith keeps both" do
      src <- liftEffect eventSource
      let
        l = map (\x -> "L" <> show x) src.event
        r = map (\x -> "R" <> show x) src.event
      lm <- liftEffect $ observeE (Event.leftmost [ l, r ])
      mw <- liftEffect $ observeE (Event.mergeWith (\x y -> x <> y) identity identity l r)
      liftEffect $ batch (src.fireT1 1 *> src.fireT1 2)
      liftEffect lm.trace >>= shouldEqual [ "L1", "L2" ]
      liftEffect mw.trace >>= shouldEqual [ "L1R1", "L2R2" ]
      liftEffect (lm.stop *> mw.stop)
    it "zip pairs simultaneous and queued occurrences" do
      a <- liftEffect eventSource
      b <- liftEffect eventSource
      o <- liftEffect $ observeOwnedE (Event.zip a.event b.event)
      liftEffect $ batch (a.fireT1 1 *> a.fireT1 2 *> b.fireT1 "x")
      liftEffect $ b.fireT1 "y"
      liftEffect o.trace >>= shouldEqual [ Tuple 1 "x", Tuple 2 "y" ]
      liftEffect o.stop
    it "zip keeps its queue while unobserved" do
      a <- liftEffect eventSource
      b <- liftEffect eventSource
      z <- liftEffect $ runOwned (Event.zip a.event b.event)
      o1 <- liftEffect $ observeE z.value
      liftEffect $ traverse_ a.fireT1 [ 1, 2 ]
      liftEffect o1.stop
      o2 <- liftEffect $ observeE z.value
      liftEffect $ b.fireT1 "x"
      liftEffect $ a.fireT1 3
      liftEffect o2.trace >>= shouldEqual [ Tuple 1 "x" ]
      liftEffect (o2.stop *> z.dispose)
    it "race follows the first to fire, the leftmost on a tie" do
      a <- liftEffect eventSource
      b <- liftEffect eventSource
      o <- liftEffect $ observeOwnedE (Event.race [ a.event, b.event ])
      liftEffect $ batch (b.fireT1 1 *> a.fireT1 2)
      liftEffect $ b.fireT1 3
      liftEffect $ a.fireT1 4
      liftEffect o.trace >>= shouldEqual [ 2, 4 ]
      liftEffect o.stop
    it "Signal.combine agrees with sequence" do
      x <- liftEffect $ signalSource 1
      y <- liftEffect $ signalSource 2
      o <- liftEffect $ observe (Signal.combine [ x.signal, y.signal ])
      liftEffect $ batch (x.putT1 3 *> y.putT1 4)
      liftEffect $ y.putT1 5
      liftEffect o.trace >>= shouldEqual [ [ 1, 2 ], [ 3, 4 ], [ 3, 5 ] ]
      liftEffect o.stop
    it "Signal.withLatest changes only with the driver" do
      x <- liftEffect $ signalSource 1
      y <- liftEffect $ signalSource "a"
      o <- liftEffect $ observeOwned (Signal.withLatest y.signal x.signal)
      liftEffect $ y.putT1 "b"
      liftEffect $ x.putT1 2
      liftEffect $ batch (x.putT1 3 *> y.putT1 "c")
      liftEffect o.trace >>= shouldEqual [ Tuple 1 "a", Tuple 2 "b", Tuple 3 "c" ]
      liftEffect o.stop

  describe "buffering against a model" do
    it "bufferCount chunks" $ liftEffect $ model (Event.bufferCount 3 3) (countModel 3 3)
    it "bufferCount slides" $ liftEffect $ model (Event.bufferCount 3 1) (countModel 3 1)
    it "bufferCount with gaps" $ liftEffect $ model (Event.bufferCount 2 3) (countModel 2 3)
    it "bufferOn" $ liftEffect do
      scripts <- randomSample' 200 genTagged
      for_ scripts \script -> do
        d <- eventSource
        n <- eventSource
        o <- observeOwnedE (Event.bufferOn n.event d.event)
        for_ script \fires -> batch $ for_ fires \f -> if f.notify then n.fireT1 unit else d.fireT1 f.value
        got <- o.trace
        o.stop
        let want = bufferOnModel (Array.concat script)
        when (got /= want) $ fail $ "bufferOn " <> show script <> ": got " <> show got <> ", want " <> show want
    it "bufferWhile" $ liftEffect do
      scripts <- randomSample' 200 genTagged
      for_ scripts \script -> do
        d <- eventSource
        cond <- signalSource false
        o <- observeOwnedE (Event.bufferWhile cond.signal d.event)
        -- In each batch a notify toggles the condition.
        for_ script \fires -> batch $ for_ fires \f ->
          if f.notify then cond.modifyT1 not else d.fireT1 f.value
        got <- o.trace
        o.stop
        let want = bufferWhileModel script
        when (got /= want) $ fail $ "bufferWhile " <> show script <> ": got " <> show got <> ", want " <> show want

  describe "buffering" do
    it "a buffer collects while unobserved" do
      src <- liftEffect eventSource
      b <- liftEffect $ runOwned (Event.bufferCount 3 3 src.event)
      o1 <- liftEffect $ observeE b.value
      liftEffect $ traverse_ src.fireT1 [ 1, 2 ]
      liftEffect o1.stop
      liftEffect $ src.fireT1 99
      o2 <- liftEffect $ observeE b.value
      liftEffect $ traverse_ src.fireT1 [ 3, 4, 5, 6 ]
      liftEffect o2.trace >>= shouldEqual [ [ 3, 4, 5 ] ]
      liftEffect (o2.stop *> b.dispose)

    it "history keeps the last n values" do
      s <- liftEffect $ signalSource 1
      o <- liftEffect $ observeOwned (Signal.history 3 s.signal)
      liftEffect $ traverse_ s.putT1 [ 2, 3, 4 ]
      liftEffect o.trace >>= shouldEqual [ [ 1 ], [ 1, 2 ], [ 1, 2, 3 ], [ 2, 3, 4 ] ]
      liftEffect o.stop

  describe "event sources" do
    it "delivers two fires of the same value in one batch to a fold" do
      src <- liftEffect eventSource
      o <- liftEffect $ observeOwned (Event.fold (\_ n -> n + 1) 0 src.event)
      liftEffect $ batch (src.fireT1 unit *> src.fireT1 unit)
      liftEffect $ src.fireT1 unit
      liftEffect o.trace >>= shouldEqual [ 0, 2, 3 ]
      liftEffect o.stop

    it "delivers both inputs of <|> in fire order" do
      a <- liftEffect eventSource
      b <- liftEffect eventSource
      o <- liftEffect $ observeE (a.event <|> b.event)
      liftEffect $ batch do
        b.fireT1 "b1"
        a.fireT1 "a1"
        b.fireT1 "b2"
      liftEffect o.trace >>= shouldEqual [ "b1", "a1", "b2" ]
      liftEffect o.stop

  describe "bridges" do
    it "tag and attachWith read the signal at the end of the round" do
      s <- liftEffect $ signalSource "x"
      src <- liftEffect eventSource
      t <- liftEffect $ observeE (Event.tag s.signal src.event)
      a <- liftEffect $ observeE (Event.attach s.signal src.event)
      liftEffect $ batch do
        src.fireT1 1
        s.putT1 "y"
      liftEffect t.trace >>= shouldEqual [ "y" ]
      liftEffect a.trace >>= shouldEqual [ Tuple "y" 1 ]
      liftEffect (t.stop *> a.stop)

    it "changes fires with the final value of each round" do
      s <- liftEffect $ signalSource 0
      o <- liftEffect $ observeE (Event.changes s.signal)
      liftEffect $ batch (s.putT1 1 *> s.putT1 2)
      liftEffect $ s.putT1 2
      liftEffect $ s.putT1 3
      liftEffect o.trace >>= shouldEqual [ 2, 3 ]
      liftEffect o.stop

    it "stepper and fold keep stepping while nothing observes them" do
      src <- liftEffect eventSource
      r <- liftEffect $ runOwned ({ latest: _, total: _ } <$> Event.stepper 0 src.event <*> Event.fold (+) 0 src.event)
      let { latest, total } = r.value
      o1 <- liftEffect $ observe (Tuple <$> latest <*> total)
      liftEffect $ src.fireT1 1
      liftEffect $ src.fireT1 2
      liftEffect o1.stop
      liftEffect $ src.fireT1 10
      liftEffect (readT0 latest) >>= shouldEqual 10
      liftEffect (readT0 total) >>= shouldEqual 13
      o2 <- liftEffect $ observe (Tuple <$> latest <*> total)
      liftEffect $ src.fireT1 4
      liftEffect o2.trace >>= shouldEqual [ Tuple 10 13, Tuple 4 17 ]
      liftEffect (o2.stop *> r.dispose)

    it "a fold over events stops when its scope is disposed" do
      src <- liftEffect eventSource
      r <- liftEffect $ runOwned $ Event.fold (+) 0 src.event
      liftEffect $ src.fireT1 1
      liftEffect $ src.fireT1 2
      liftEffect (readT0 r.value) >>= shouldEqual 3
      liftEffect r.dispose
      liftEffect $ src.fireT1 4
      -- A read of the paused fold, which warns (SCR001) on purpose.
      liftEffect (withoutStrict (readT0 r.value)) >>= shouldEqual 3

  describe "ownership" do
    it "holds no links while unobserved and releases them on dispose" do
      before <- liftEffect readStats
      src <- liftEffect eventSource
      s <- liftEffect $ signalSource 1
      let e = Event.attachWith (+) s.signal src.event <|> Event.changes s.signal
      unobserved <- liftEffect readStats
      (unobserved.links - before.links) `shouldEqual` 0
      o <- liftEffect $ observeE e
      c <- liftEffect $ observeOwned (Event.fold (\_ n -> n + 1) 0 (filter (_ > 0) e))
      liftEffect $ src.fireT1 1
      liftEffect $ s.putT1 2
      liftEffect o.trace >>= shouldEqual [ 2, 2 ]
      liftEffect c.trace >>= shouldEqual [ 0, 1, 2 ]
      liftEffect (o.stop *> c.stop)
      after <- liftEffect readStats
      { links: after.links - before.links, effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes }
        `shouldEqual` { links: 0, effects: 0, scopes: 0 }
