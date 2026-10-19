module Test.Errors (spec) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Time.Duration (Milliseconds(..))
import Data.Tuple (Tuple(..))
import Effect.Aff (delay, makeAff)
import Effect.Class (liftEffect)
import Effect.Exception (error, message, throw)
import Effect.Ref as Ref
import Screamer.Owned (child, onError, runOwned, subscribe)
import Screamer.Resource (Backoff(..), Remote(..), Strategy(..), isLoading, keepLast, resourceWith, retry, toMaybe, withDefault)
import Screamer.Signal (read)
import Screamer.Signal as Signal
import Screamer.Source (signalSource)
import Test.Fakes as Fake
import Test.Observe (observe)
import Test.Spec (Spec, after_, before_, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Error handling" do
  it "catching recovers from a throwing signal, and dependents stay consistent" do
    s <- liftEffect $ signalSource 1
    let
      risky = s.signal <#> \n -> if n == 0 then unsafeThrow "zero" else 10 / n
      safe = Signal.catching (const (-1)) risky
      both = Tuple <$> safe <*> s.signal
    o <- liftEffect $ observe (map (\t -> show t) both)
    liftEffect $ s.put 0
    liftEffect $ s.put 5
    liftEffect o.trace >>= shouldEqual [ "(Tuple 10 1)", "(Tuple -1 0)", "(Tuple 2 5)" ]
    liftEffect o.stop

  it "attempt exposes the error" do
    s <- liftEffect $ signalSource 0
    let r = Signal.attempt (s.signal <#> \n -> if n == 0 then unsafeThrow "zero" else n)
    liftEffect (read r) >>= case _ of
      Left e -> message e `shouldEqual` "zero"
      Right _ -> shouldEqual "Left" "Right"

  it "an onError boundary catches what its children's effects throw" do
    failed <- liftEffect $ Ref.new Nothing
    s <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned do
      onError \e -> Ref.write (Just (message e)) failed
      child $ subscribe s.signal \n -> when (n == 0) (throw "broken")
    liftEffect $ s.put 0
    liftEffect (Ref.read failed) >>= shouldEqual (Just "broken")
    liftEffect r.dispose

  it "Remote combines with the leftmost failure first, then Loading" do
    let
      ok = Loaded 1 :: Remote Int
      bad x = Failed (error x) :: Remote Int
    (add <$> ok <*> ok) `shouldEqual` Loaded 2
    (add <$> bad "a" <*> bad "b") `shouldEqual` bad "a"
    (add <$> Loading <*> bad "b") `shouldEqual` bad "b"
    (add <$> ok <*> Loading) `shouldEqual` Loading
    withDefault 0 (Loading :: Remote Int) `shouldEqual` 0
    toMaybe ok `shouldEqual` Just 1
    isLoading (Loading :: Remote Int) `shouldEqual` true

  it "keepLast shows the previous result while the next one loads" do
    s <- liftEffect $ signalSource (Loading :: Remote Int)
    o <- liftEffect $ observe (keepLast s.signal)
    liftEffect do
      s.put (Loaded 1)
      s.put Loading
      s.put (Loaded 2)
      s.put (Failed (error "x"))
      s.put Loading
    liftEffect o.trace >>= shouldEqual [ Loading, Loaded 1, Loaded 2, Failed (error "x"), Loading ]
    liftEffect o.stop

  before_ (liftEffect Fake.installFakeTimers) $ after_ (liftEffect Fake.uninstallFakeTimers) $ describe "retry" do
    it "retries with exponential backoff until the request succeeds" do
      attempts <- liftEffect $ Ref.new 0
      let
        flaky _ = makeAff \cb -> do
          n <- Ref.modify (_ + 1) attempts
          cb (if n < 3 then Left (error ("fail " <> show n)) else Right n)
          pure mempty
        policy = { retries: 5, backoff: Exponential { initial: Milliseconds 100.0, max: Milliseconds 1000.0 } }
      input <- liftEffect $ signalSource unit
      r <- liftEffect $ runOwned (resourceWith Switch input.signal (retry policy flaky))
      yield
      liftEffect (Ref.read attempts) >>= shouldEqual 1
      liftEffect $ Fake.advance 100.0
      yield
      liftEffect (Ref.read attempts) >>= shouldEqual 2
      liftEffect $ Fake.advance 199.0
      yield
      liftEffect (Ref.read attempts) >>= shouldEqual 2
      liftEffect $ Fake.advance 1.0
      yield
      liftEffect (Ref.read attempts) >>= shouldEqual 3
      liftEffect (read r.value) >>= shouldEqual (Loaded 3)
      liftEffect r.dispose

    it "gives up after the last retry with the last failure" do
      let
        fails _ = makeAff \cb -> cb (Left (error "down")) $> mempty
        policy = { retries: 2, backoff: Fixed (Milliseconds 50.0) }
      input <- liftEffect $ signalSource unit
      r <- liftEffect $ runOwned (resourceWith Switch input.signal (retry policy fails))
      yield
      liftEffect $ Fake.advance 50.0
      yield
      liftEffect (read r.value) >>= shouldEqual (Loading :: Remote Unit)
      liftEffect $ Fake.advance 50.0
      yield
      liftEffect (read r.value) >>= shouldEqual (Failed (error "down") :: Remote Unit)
      liftEffect r.dispose

    it "disposing mid-backoff cancels the pending retry" do
      attempts <- liftEffect $ Ref.new 0
      let
        fails _ = makeAff \cb -> Ref.modify_ (_ + 1) attempts *> cb (Left (error "down")) $> mempty
        policy = { retries: 3, backoff: Fixed (Milliseconds 50.0) }
      input <- liftEffect $ signalSource unit
      r <- liftEffect $ runOwned (resourceWith Switch input.signal (retry policy fails))
      yield
      liftEffect Fake.pendingTimers >>= shouldEqual 1
      liftEffect r.dispose
      yield
      liftEffect Fake.pendingTimers >>= shouldEqual 0
      liftEffect $ Fake.advance 500.0
      yield
      liftEffect (Ref.read attempts) >>= shouldEqual 1
  where
  -- Let the request fibers run: under fake timers, `delay 0` still uses the
  -- real `setImmediate`.
  yield = delay (Milliseconds 0.0)

  unsafeThrow :: forall a. String -> a
  unsafeThrow = unsafeThrowImpl

foreign import unsafeThrowImpl :: forall a. String -> a
