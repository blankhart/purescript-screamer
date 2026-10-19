module Test.Host (spec) where

import Prelude

import Data.Array as Array
import Data.DateTime.Instant (unInstant)
import Data.Foldable (minimumBy)
import Data.Function (on)
import Data.Maybe (Maybe(..))
import Data.Newtype (un)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Host (Host, host, withHost)
import Screamer.Owned (runOwned)
import Screamer.Runtime (readStats)
import Screamer.Source (eventSource)
import Screamer.Time as Time
import Test.Event (observeE)
import Test.Observe (observe)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

type Timer = { id :: Int, at :: Number, every :: Maybe Number, run :: Number -> Effect Unit }

-- | A host whose time moves only when `advance` says, with no global timers.
type FakeHost = { host :: Host, advance :: Number -> Effect Unit, scheduled :: Effect Int }

fakeHost :: Number -> Effect FakeHost
fakeHost start = do
  now <- Ref.new start
  timers <- Ref.new ([] :: Array Timer)
  nextId <- Ref.new 0
  let
    schedule delay every run = do
      id <- Ref.modify' (\i -> { state: i + 1, value: i }) nextId
      t <- Ref.read now
      Ref.modify_ (_ <> [ { id, at: t + delay, every, run } ]) timers
      pure (Ref.modify_ (Array.filter ((_ /= id) <<< _.id)) timers)
    advance d = do
      target <- (_ + d) <$> Ref.read now
      let
        loop = do
          due <- Array.filter ((_ <= target) <<< _.at) <$> Ref.read timers
          case minimumBy (compare `on` \x -> { at: x.at, id: x.id }) due of
            Nothing -> Ref.write target now
            Just t -> do
              Ref.write t.at now
              Ref.modify_ (Array.mapMaybe \x -> if x.id /= t.id then Just x else (\e -> x { at = x.at + e }) <$> t.every) timers
              t.run t.at
              loop
      loop
  pure
    { host:
        { now: Ref.read now
        , setTimeout: \ms action -> schedule ms Nothing (const action)
        , setInterval: \ms action -> schedule ms (Just ms) (const action)
        , requestFrame: \action -> schedule 16.0 Nothing action
        }
    , advance
    , scheduled: Array.length <$> Ref.read timers
    }

spec :: Spec Unit
spec = describe "Screamer.Host" do
  it "defaults to the browser host" do
    r <- liftEffect $ runOwned host
    t <- liftEffect r.value.now
    (t > 0.0) `shouldEqual` true
    liftEffect r.dispose

  it "drives Time.clock from a fake host" do
    fake <- liftEffect $ fakeHost 1000.0
    r <- liftEffect $ runOwned $ withHost fake.host $ Time.clock (Milliseconds 1000.0)
    o <- liftEffect $ observe (un Milliseconds <<< unInstant <$> r.value)
    liftEffect $ fake.advance 999.0
    liftEffect $ fake.advance 1.0
    liftEffect $ fake.advance 2500.0
    liftEffect o.trace >>= shouldEqual [ 1000.0, 2000.0, 3000.0, 4000.0 ]
    liftEffect (o.stop *> r.dispose)
    liftEffect fake.scheduled >>= shouldEqual 0

  it "drives Time.interval from a fake host" do
    fake <- liftEffect $ fakeHost 0.0
    r <- liftEffect $ runOwned $ withHost fake.host $ Time.interval (Milliseconds 100.0)
    o <- liftEffect $ observeE r.value
    liftEffect $ fake.advance 350.0
    liftEffect (Array.length <$> o.trace) >>= shouldEqual 3
    liftEffect (o.stop *> r.dispose)
    liftEffect fake.scheduled >>= shouldEqual 0

  it "drives Time.debounce from a fake host" do
    fake <- liftEffect $ fakeHost 0.0
    src <- liftEffect eventSource
    before <- liftEffect readStats
    r <- liftEffect $ runOwned $ withHost fake.host $ Time.debounce (Milliseconds 100.0) src.event
    o <- liftEffect $ observeE r.value
    liftEffect do
      src.fire 1
      fake.advance 50.0
      src.fire 2
      fake.advance 99.0
    liftEffect o.trace >>= shouldEqual []
    liftEffect $ fake.advance 1.0
    liftEffect o.trace >>= shouldEqual [ 2 ]
    liftEffect $ src.fire 3
    liftEffect (o.stop *> r.dispose)
    liftEffect fake.scheduled >>= shouldEqual 0
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }
