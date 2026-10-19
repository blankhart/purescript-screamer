-- | Time under test control.
-- |
-- | `fakeHost` is a `Screamer.Host` whose time moves only when `advance`
-- | says: pass it to `withHost` and nothing touches global timers. The
-- | `installFake*` functions instead replace the global timers, frames and
-- | `Date.now`, for code that uses them directly.
module Screamer.Test.Clock
  ( FakeHost
  , fakeHost
  , installFakeTimers
  , uninstallFakeTimers
  , advance
  , pendingTimers
  , installFakeFrames
  , uninstallFakeFrames
  , frame
  , pendingFrames
  ) where

import Prelude

import Data.Array as Array
import Data.Foldable (minimumBy)
import Data.Function (on)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Ref as Ref
import Screamer.Host (Host)

-- | A scheduled callback.
type Timer = { id :: Int, at :: Number, every :: Maybe Number, run :: Number -> Effect Unit }

-- | A host whose time moves only when `advance` says, with no global
-- | timers, starting at the given time. `advance` runs due timers in order
-- | of their time, then of scheduling; `scheduled` counts timers not yet
-- | run or cancelled. A frame is a timer 16 ms away, given its time.
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
    step d = do
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
    , advance: step
    , scheduled: Array.length <$> Ref.read timers
    }

-- | Replace the global `setTimeout`, `setInterval`, their `clear`s and
-- | `Date.now` with a fake clock starting at 1,000,000.
foreign import installFakeTimers :: Effect Unit

foreign import uninstallFakeTimers :: Effect Unit

-- | Advance the fake clock, firing due timers in order.
foreign import advance :: Number -> Effect Unit

foreign import pendingTimers :: Effect Int

-- | Replace the global `requestAnimationFrame` and `cancelAnimationFrame`.
foreign import installFakeFrames :: Effect Unit

foreign import uninstallFakeFrames :: Effect Unit

-- | Run the callbacks scheduled for the next frame with the given timestamp.
foreign import frame :: Number -> Effect Unit

foreign import pendingFrames :: Effect Int
