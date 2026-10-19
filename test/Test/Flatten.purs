module Test.Flatten (spec) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..), either)
import Data.Foldable (for_, traverse_)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Aff (Aff, delay, effectCanceler, makeAff)
import Effect.Class (liftEffect)
import Effect.Exception (Error, error, message)
import Effect.Ref as Ref
import Screamer.Event (Event)
import Screamer.Event as Event
import Screamer.Flatten (concatOwned, exhaustOwned, mergeOwned, switchOwned)
import Screamer.Owned (Owned, onCleanup, runOwned)
import Screamer.Resource (Remote(..), Strategy(..), request, resourceWith)
import Screamer.Runtime (readStats)
import Screamer.Signal (read)
import Screamer.Signal as Signal
import Screamer.Source (eventSource, signalSource)
import Screamer.Time as Time
import Test.Event (observeE)
import Test.Fakes as Fake
import Test.Observe (observe)
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Flattening" do
  pure_
  owned
  requests

pure_ :: Spec Unit
pure_ = describe "pure" do
  it "switchLatest follows the inner signal and releases the old one" do
    a <- liftEffect $ signalSource 1
    b <- liftEffect $ signalSource 10
    which <- liftEffect $ signalSource a.signal
    o <- liftEffect $ observe (Signal.switchLatest which.signal)
    liftEffect $ a.put 2
    liftEffect $ which.put b.signal
    liftEffect $ a.put 3
    liftEffect $ b.put 11
    liftEffect o.trace >>= shouldEqual [ 1, 2, 10, 11 ]
    liftEffect o.stop

  it "switchEvent follows the event the signal holds" do
    a <- liftEffect eventSource
    b <- liftEffect eventSource
    which <- liftEffect $ signalSource a.event
    o <- liftEffect $ observeE (Event.switchEvent which.signal)
    liftEffect $ a.fire "a1"
    liftEffect $ which.put b.event
    liftEffect $ a.fire "a2"
    liftEffect $ b.fire "b1"
    liftEffect o.trace >>= shouldEqual [ "a1", "b1" ]
    liftEffect o.stop

-- | Run an action once after the delay, unless the scope is disposed first.
afterDo :: Milliseconds -> Effect Unit -> Owned Unit
afterDo d action = Time.after d >>= \e -> Event.subscribe e \_ -> action

-- | A child that fires the value once after the delay, and is then done.
emitAfter :: forall a. Milliseconds -> a -> Effect Unit -> Owned (Event a)
emitAfter d x done = do
  e <- Time.after d
  Event.subscribe e \_ -> done
  pure (x <$ e)

owned :: Spec Unit
owned = before_ (liftEffect Fake.installFakeTimers) $ after_ (liftEffect Fake.uninstallFakeTimers) $ describe "owned inner work" do
  it "switchOwned disposes the previous child, releasing its timer" do
    log <- liftEffect $ Ref.new []
    input <- liftEffect $ signalSource "a"
    before <- liftEffect readStats
    r <- liftEffect $ runOwned $ switchOwned input.signal \x -> do
      afterDo (Milliseconds 100.0) (Ref.modify_ (_ <> [ "fired " <> x ]) log)
      onCleanup (Ref.modify_ (_ <> [ "disposed " <> x ]) log)
      pure (x <> "!")
    liftEffect (read r.value) >>= shouldEqual "a!"
    liftEffect Fake.pendingTimers >>= shouldEqual 1
    liftEffect $ input.put "b"
    liftEffect (read r.value) >>= shouldEqual "b!"
    liftEffect Fake.pendingTimers >>= shouldEqual 1
    liftEffect $ Fake.advance 150.0
    liftEffect r.dispose
    liftEffect (Ref.read log) >>= shouldEqual [ "disposed a", "fired b", "disposed b" ]
    after <- liftEffect readStats
    { scopes: after.liveScopes - before.liveScopes, effects: after.liveEffects - before.liveEffects, links: after.links - before.links }
      `shouldEqual` { scopes: 0, effects: 0, links: 0 }

  it "mergeOwned runs every child until it is done" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned $ mergeOwned src.event \n done -> do
      emitAfter (Milliseconds (toNumber n)) n done
    o <- liftEffect $ observeE r.value
    liftEffect $ traverse_ src.fire [ 300, 100, 200 ]
    liftEffect Fake.pendingTimers >>= shouldEqual 3
    liftEffect $ Fake.advance 1000.0
    liftEffect o.trace >>= shouldEqual [ 100, 200, 300 ]
    liftEffect Fake.pendingTimers >>= shouldEqual 0
    liftEffect (o.stop *> r.dispose)

  it "concatOwned runs one child at a time, in order" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned $ concatOwned src.event \n done -> do
      emitAfter (Milliseconds (toNumber n)) n done
    o <- liftEffect $ observeE r.value
    liftEffect $ traverse_ src.fire [ 300, 100, 200 ]
    liftEffect Fake.pendingTimers >>= shouldEqual 1
    liftEffect $ Fake.advance 350.0
    liftEffect o.trace >>= shouldEqual [ 300 ]
    liftEffect $ Fake.advance 1000.0
    liftEffect o.trace >>= shouldEqual [ 300, 100, 200 ]
    liftEffect (o.stop *> r.dispose)

  it "exhaustOwned ignores inputs while a child runs" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned $ exhaustOwned src.event \n done -> do
      emitAfter (Milliseconds 100.0) n done
    o <- liftEffect $ observeE r.value
    liftEffect $ traverse_ src.fire [ 1, 2 ]
    liftEffect $ Fake.advance 150.0
    liftEffect $ src.fire 3
    liftEffect $ Fake.advance 150.0
    liftEffect o.trace >>= shouldEqual [ 1, 3 ]
    liftEffect (o.stop *> r.dispose)

  it "disposing the parent disposes every running child" do
    src <- liftEffect eventSource
    r <- liftEffect $ runOwned $ mergeOwned src.event \_ _ -> do
      void $ Time.after (Milliseconds 100.0)
      pure (Event.changes (pure 0))
    liftEffect $ traverse_ src.fire [ 1, 2, 3 ]
    liftEffect Fake.pendingTimers >>= shouldEqual 3
    liftEffect r.dispose
    liftEffect Fake.pendingTimers >>= shouldEqual 0
  where
  toNumber n = if n == 0 then 0.0 else 1.0 + toNumber (n - 1)

-- | Requests resolved by hand: `resolve n v` settles every pending request
-- | for `n`; killed requests are recorded.
type Server = { request :: Int -> Aff String, resolve :: Int -> String -> Aff Unit, killed :: Aff (Array Int) }

server :: Aff Server
server = liftEffect do
  pending <- Ref.new []
  killed <- Ref.new []
  pure
    { request: \n -> makeAff \cb -> do
        Ref.modify_ (_ <> [ { n, cb } ]) pending
        pure $ effectCanceler (Ref.modify_ (_ <> [ n ]) killed)
    , resolve: \n v -> do
        liftEffect $ Ref.read pending >>= \ps -> for_ (Array.filter (\p -> p.n == n) ps) \p -> p.cb (Right v)
        yield
    , killed: liftEffect (Ref.read killed)
    }

requests :: Spec Unit
requests = describe "request strategies" do
  it "Switch never shows a stale result" do
    s <- server
    input <- liftEffect eventSource
    r <- liftEffect $ runOwned (request Switch input.event s.request)
    o <- liftEffect $ observeE r.value
    liftEffect $ input.fire 1
    liftEffect $ input.fire 2
    yield
    s.resolve 1 "one"
    s.resolve 2 "two"
    liftEffect (shown <$> o.trace) >>= shouldEqual [ "two" ]
    s.killed >>= shouldEqual [ 1 ]
    liftEffect (o.stop *> r.dispose)

  it "Merge shows every result as it arrives" do
    s <- server
    input <- liftEffect eventSource
    r <- liftEffect $ runOwned (request Merge input.event s.request)
    o <- liftEffect $ observeE r.value
    liftEffect $ traverse_ input.fire [ 1, 2 ]
    yield
    s.resolve 2 "two"
    s.resolve 1 "one"
    liftEffect (shown <$> o.trace) >>= shouldEqual [ "two", "one" ]
    liftEffect (o.stop *> r.dispose)

  it "Concat runs requests in order, one at a time" do
    s <- server
    input <- liftEffect eventSource
    r <- liftEffect $ runOwned (request Concat input.event s.request)
    o <- liftEffect $ observeE r.value
    liftEffect $ traverse_ input.fire [ 1, 2 ]
    yield
    s.resolve 2 "early"
    liftEffect (shown <$> o.trace) >>= shouldEqual []
    s.resolve 1 "one"
    s.resolve 2 "two"
    liftEffect (shown <$> o.trace) >>= shouldEqual [ "one", "two" ]
    liftEffect (o.stop *> r.dispose)

  it "Exhaust ignores inputs while a request runs" do
    s <- server
    input <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned (resourceWith Exhaust input.signal s.request)
    liftEffect $ input.put 2
    yield
    s.resolve 2 "two"
    liftEffect (read r.value) >>= shouldEqual Loading
    s.resolve 1 "one"
    liftEffect (read r.value) >>= shouldEqual (Loaded "one")
    liftEffect $ input.put 3
    yield
    s.resolve 3 "three"
    liftEffect (read r.value) >>= shouldEqual (Loaded "three")
    liftEffect r.dispose

  it "disposing the scope kills every running request" do
    s <- server
    input <- liftEffect eventSource
    r <- liftEffect $ runOwned (request Merge input.event s.request)
    liftEffect $ traverse_ input.fire [ 1, 2, 3 ]
    yield
    liftEffect r.dispose
    yield
    s.killed >>= shouldEqual [ 1, 2, 3 ]

  it "reports failures as Left" do
    input <- liftEffect eventSource
    r <- liftEffect $ runOwned (request Switch input.event \_ -> makeAff \cb -> cb (Left (error "boom")) $> mempty)
    o <- liftEffect $ observeE (r.value :: Event (Either Error Unit))
    liftEffect $ input.fire unit
    yield
    trace <- liftEffect o.trace
    map (either message (const "ok")) trace `shouldEqual` [ "boom" ]
    liftEffect (o.stop *> r.dispose)

shown :: Array (Either Error String) -> Array String
shown = map (either (\e -> "error " <> message e) identity)

yield :: Aff Unit
yield = delay (Milliseconds 0.0)
