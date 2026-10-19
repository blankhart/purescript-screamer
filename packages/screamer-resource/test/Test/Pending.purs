module Test.Pending (spec) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Data.Time.Duration (Milliseconds(..))
import Effect.Aff (Aff, delay, makeAff, nonCanceler)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Owned (child, runOwned)
import Screamer.Pending (pending, settled)
import Screamer.Resource (Remote(..), resource)
import Screamer.Runtime (readStats)
import Screamer.Signal (read)
import Screamer.Source (signalSource)
import Screamer.Test (observe)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

-- | A request that waits until the test answers it.
type Manual = { request :: Int -> Aff Int, answer :: Int -> Effect Unit }

manual :: Effect Manual
manual = do
  waiting <- Ref.new Nothing
  pure
    { request: \_ -> makeAff \k -> Ref.write (Just k) waiting $> nonCanceler
    , answer: \n -> Ref.read waiting >>= case _ of
        Just k -> Ref.write Nothing waiting *> k (Right n)
        Nothing -> pure unit
    }

spec :: Spec Unit
spec = describe "Screamer.Pending" do
  it "counts work on the scope and its ancestors; done is idempotent" do
    r <- liftEffect $ runOwned do
      top <- settled
      c <- child do
        done <- pending
        mine <- settled
        pure { done, mine }
      pure { top, c }
    let { top, c } = r.value
    t <- liftEffect $ observe top
    m <- liftEffect $ observe c.value.mine
    liftEffect (c.value.done *> c.value.done)
    liftEffect t.trace >>= shouldEqual [ false, true ]
    liftEffect m.trace >>= shouldEqual [ false, true ]
    liftEffect (t.stop *> m.stop *> r.dispose)

  it "goes false then true around a resource" do
    req <- liftEffect manual
    input <- liftEffect $ signalSource 1
    r <- liftEffect $ runOwned do
      s <- settled
      res <- resource input.signal req.request
      pure { s, res }
    o <- liftEffect $ observe r.value.s
    liftEffect (read r.value.res) >>= shouldEqual Loading
    liftEffect $ req.answer 10
    yield
    liftEffect (read r.value.res) >>= shouldEqual (Loaded 10)
    liftEffect $ input.put 2
    liftEffect $ req.answer 20
    yield
    liftEffect o.trace >>= shouldEqual [ false, true, false, true ]
    liftEffect (o.stop *> r.dispose)

  it "stays correct when the scope is disposed mid-request" do
    req <- liftEffect manual
    input <- liftEffect $ signalSource 1
    before <- liftEffect readStats
    r <- liftEffect $ runOwned do
      s <- settled
      c <- child (resource input.signal req.request)
      pure { s, c }
    o <- liftEffect $ observe r.value.s
    liftEffect r.value.c.dispose
    liftEffect $ req.answer 10
    yield
    liftEffect o.trace >>= shouldEqual [ false, true ]
    liftEffect (o.stop *> r.dispose)
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }

-- | Let the request fibers run.
yield :: Aff Unit
yield = delay (Milliseconds 0.0)
