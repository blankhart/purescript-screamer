-- | Animated values: signals that ease toward a target.
-- |
-- | `tween` and `spring` are stateful, so they are made in `Owned`. Each
-- | runs a `Screamer.Time.frameLoop` only while it is moving: the loop
-- | starts when the target changes and stops requesting frames once the
-- | value reaches it, so a settled value costs nothing. Frames come from
-- | the scope's `Screamer.Host`, so a fake host drives them in tests.
-- | Where motion is reduced (`Screamer.Motion.ReducedMotion`) a new target
-- | is jumped to at once.
module Screamer.Motion.Value
  ( class Interpolate
  , interpolate
  , Animated
  , TweenOptions
  , tween
  , tweened
  , SpringOptions
  , defaultSpring
  , spring
  , sprung
  , linear
  , quadOut
  , cubicOut
  , cubicInOut
  ) where

import Prelude

import Data.Array as Array
import Data.Int (round, toNumber)
import Data.Maybe (Maybe(..))
import Data.Newtype (un)
import Data.Ord (abs)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Event as Event
import Screamer.Motion.ReducedMotion (reducedMotionNow)
import Screamer.Owned (Owned)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (signalSource)
import Screamer.Time (frameLoop)

-- | Values between two others: `interpolate a b 0.0 == a` and
-- | `interpolate a b 1.0 == b`. Progress outside 0 to 1 (a spring's
-- | overshoot) extrapolates where the type can.
class Interpolate a where
  interpolate :: a -> a -> Number -> a

instance Interpolate Number where
  interpolate a b t = a + (b - a) * t

instance Interpolate Int where
  interpolate a b t = round (interpolate (toNumber a) (toNumber b) t)

-- | Element by element; arrays of different lengths jump to the target.
instance Interpolate a => Interpolate (Array a) where
  interpolate a b t
    | Array.length a == Array.length b = Array.zipWith (\x y -> interpolate x y t) a b
    | otherwise = b

-- | An animated value: the signal, `set` to animate toward a target, and
-- | `jump` to move to a value at once, without animating.
type Animated a = { signal :: Signal a, set :: a -> Effect Unit, jump :: a -> Effect Unit }

-- | `easing` maps progress from 0 to 1 onto progress from 0 to 1.
type TweenOptions = { duration :: Milliseconds, easing :: Number -> Number }

type TweenState a = { from :: a, to :: a, current :: a, start :: Maybe Number }

-- | A tweened value starting at the given one. `set` goes from the value
-- | shown now to the target over the duration, from the next frame.
tweened :: forall a. Interpolate a => TweenOptions -> a -> Owned (Animated a)
tweened opts initial = do
  reduced <- reducedMotionNow
  out <- liftEffect $ signalSource initial
  state <- liftEffect $ Ref.new ({ from: initial, to: initial, current: initial, start: Nothing } :: TweenState a)
  let ms = un Milliseconds opts.duration
  loop <- frameLoop \ts -> do
    st <- Ref.read state
    let
      start = case st.start of
        Just t0 -> t0
        Nothing -> ts
      t = if ms <= 0.0 then 1.0 else min 1.0 ((ts - start) / ms)
      v = if t >= 1.0 then st.to else interpolate st.from st.to (opts.easing t)
    Ref.write st { current = v, start = Just start } state
    out.putT1 v
    pure (t < 1.0)
  let
    jump v = do
      loop.stop
      Ref.write { from: v, to: v, current: v, start: Nothing } state
      out.putT1 v
    set v = do
      r <- reduced
      if r || ms <= 0.0 then jump v
      else do
        Ref.modify_ (\st -> st { from = st.current, to = v, start = Nothing }) state
        loop.start
  pure { signal: out.signal, set, jump }

-- | The target signal, followed with a tween: it starts at the target's
-- | value and eases to each new one.
tween :: forall a. Interpolate a => TweenOptions -> Signal a -> Owned (Signal a)
tween opts target = do
  a <- tweened opts =<< liftEffect (readT0 target)
  Event.subscribe (Event.changes target) a.set
  pure a.signal

-- | A spring that moves the value from where it is toward the target.
-- | `stiffness` pulls it toward the target and `damping` slows it, each per
-- | frame at 60 frames a second. The spring settles, snapping to the
-- | target, once both its distance from the target and its speed are
-- | under `precision`. Distance and speed are fractions of the way from
-- | where the move started to the target, since `Interpolate` gives no
-- | distance; a new target starts a new move from the value shown, at rest.
type SpringOptions = { stiffness :: Number, damping :: Number, precision :: Number }

-- | Svelte's defaults: `{ stiffness: 0.15, damping: 0.8, precision: 0.01 }`.
defaultSpring :: SpringOptions
defaultSpring = { stiffness: 0.15, damping: 0.8, precision: 0.01 }

type SpringState a = { from :: a, to :: a, current :: a, progress :: Number, velocity :: Number, last :: Maybe Number }

-- | A sprung value starting at the given one.
sprung :: forall a. Interpolate a => SpringOptions -> a -> Owned (Animated a)
sprung opts initial = do
  reduced <- reducedMotionNow
  out <- liftEffect $ signalSource initial
  state <- liftEffect $ Ref.new (rest initial)
  loop <- frameLoop \ts -> do
    st <- Ref.read state
    let
      -- Frames elapsed at 60 a second, at most 4, so a stalled tab does
      -- not throw the spring.
      dt = case st.last of
        Nothing -> 1.0
        Just t0 -> min 4.0 ((ts - t0) * 60.0 / 1000.0)
      acceleration = opts.stiffness * (1.0 - st.progress) - opts.damping * st.velocity
      velocity = st.velocity + acceleration * dt
      progress = st.progress + velocity * dt
      settled = abs (1.0 - progress) < opts.precision && abs velocity < opts.precision
    if settled then do
      Ref.write (rest st.to) state
      out.putT1 st.to
      pure false
    else do
      let v = interpolate st.from st.to progress
      Ref.write st { current = v, progress = progress, velocity = velocity, last = Just ts } state
      out.putT1 v
      pure true
  let
    jump v = do
      loop.stop
      Ref.write (rest v) state
      out.putT1 v
    set v = do
      r <- reduced
      if r then jump v
      else do
        Ref.modify_ (\st -> st { from = st.current, to = v, progress = 0.0, velocity = 0.0, last = Nothing }) state
        loop.start
  pure { signal: out.signal, set, jump }
  where
  rest :: a -> SpringState a
  rest v = { from: v, to: v, current: v, progress: 1.0, velocity: 0.0, last: Nothing }

-- | The target signal, followed with a spring.
spring :: forall a. Interpolate a => SpringOptions -> Signal a -> Owned (Signal a)
spring opts target = do
  a <- sprung opts =<< liftEffect (readT0 target)
  Event.subscribe (Event.changes target) a.set
  pure a.signal

linear :: Number -> Number
linear t = t

quadOut :: Number -> Number
quadOut t = t * (2.0 - t)

cubicOut :: Number -> Number
cubicOut t = let u = t - 1.0 in u * u * u + 1.0

cubicInOut :: Number -> Number
cubicInOut t
  | t < 0.5 = 4.0 * t * t * t
  | otherwise = let u = 2.0 * t - 2.0 in 0.5 * u * u * u + 1.0
