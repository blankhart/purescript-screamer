-- | Motion: enter, leave and move transitions, Web Animations, crossfades,
-- | animated values and view transitions, all honouring reduced motion.
-- | Each is in its own module; this one re-exports them.
module Screamer.Motion
  ( module Screamer.Motion.Transition
  , module Screamer.Motion.Animate
  , module Screamer.Motion.Value
  , module Screamer.Motion.ViewTransition
  , module Screamer.Motion.ReducedMotion
  ) where

import Screamer.Motion.Animate (AnimationOptions, Crossfade, CrossfadeOptions, Keyframe, animate, crossfade, flipMoves, keyframe, leaveWith)
import Screamer.Motion.ReducedMotion (reducedMotion, reducedMotionNow, withReducedMotion)
import Screamer.Motion.Transition (Axis(..), Phase, TransitionOptions, fade, slide, transition, withoutTransitions)
import Screamer.Motion.Value (class Interpolate, Animated, SpringOptions, TweenOptions, cubicInOut, cubicOut, defaultSpring, interpolate, linear, quadOut, spring, sprung, tween, tweened)
import Screamer.Motion.ViewTransition (viewTransition, viewTransitionHere)
