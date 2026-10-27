-- | Enter, leave and move transitions for the `dyn` branches and `each`
-- | rows inside an element, done with CSS classes (Vue's `<Transition>`
-- | and `<TransitionGroup>` model) or with inline-style presets.
-- |
-- | Durations are always stated, never read from computed styles. A
-- | transition ends at the first of its node's own `transitionend` or
-- | `animationend` and a timer at the duration, so the hook always
-- | finishes even when no event fires.
-- |
-- | Hooks run on each top-level element of a branch or row: wrap a branch
-- | that should animate as one in a single element. They honour
-- | `Screamer.Motion.ReducedMotion`.
module Screamer.Motion.Transition
  ( Phase
  , TransitionOptions
  , transition
  , fade
  , Axis(..)
  , slide
  , withoutTransitions
  ) where

import Prelude

import Data.Newtype (un)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Screamer.Element (Element, Move, immediateLeave, noEnter, noMove, withEnter, withLeave, withMove)
import Screamer.Host (Host)
import Screamer.Motion.Internal (animating)
import Web.DOM.Node (Node)

-- | The classes of one direction. `from` and `active` are added first;
-- | after the node has been painted with them, `from` is swapped for `to`;
-- | at the end `active` and `to` are removed (on enter) or the node is
-- | detached (on leave). Each may hold several classes, or none.
-- |
-- | ```css
-- | .fade-active { transition: opacity var(--screamer-duration) ease; }
-- | .fade-from, .fade-to { opacity: 0; }   /* enter from, leave to */
-- | ```
type Phase = { from :: String, active :: String, to :: String }

-- | `move` is the class a moved `each` row has while it slides to its new
-- | place (Vue's move class), as in
-- | `.list-move { transition: transform var(--screamer-duration) ease; }`;
-- | the empty string leaves moves to an enclosing `withMove` or `flip`.
-- | `duration` sets both the fallback timer and the `--screamer-duration`
-- | custom property, which the node has while it transitions, so the
-- | stylesheet need not state it again. With `appear`, the initial build
-- | enters too.
type TransitionOptions =
  { enter :: Phase
  , leave :: Phase
  , move :: String
  , duration :: Milliseconds
  , appear :: Boolean
  }

foreign import cssEnterImpl :: Host -> Phase -> Number -> Node -> Effect (Effect Unit)

foreign import cssLeaveImpl :: Host -> Phase -> Number -> Node -> Effect Unit -> Effect (Effect Unit)

foreign import cssMoveImpl :: Host -> String -> Number -> Move -> Effect (Effect Unit)

-- | CSS-class transitions for the branches and rows inside the element.
-- | Installs the enter and leave hooks, and the move hook unless `move` is
-- | empty.
transition :: TransitionOptions -> Element -> Element
transition opts =
  withLeave (\node done -> animating done \h -> cssLeaveImpl h opts.leave ms node done)
    <<< withEnter { appear: opts.appear } (\node -> animating (pure unit) \h -> cssEnterImpl h opts.enter ms node)
    <<< (if opts.move == "" then identity else withMove \m -> animating (pure unit) \h -> cssMoveImpl h opts.move ms m)
  where
  ms = un Milliseconds opts.duration

-- | An inline style, the hidden state a preset enters from and leaves to.
foreign import data Look :: Type

foreign import fadeLook :: Look

foreign import slideLook :: String -> Look

foreign import styleEnterImpl :: Host -> Look -> Number -> Node -> Effect (Effect Unit)

foreign import styleLeaveImpl :: Host -> Look -> Number -> Node -> Effect Unit -> Effect (Effect Unit)

preset :: Look -> Milliseconds -> Element -> Element
preset look (Milliseconds ms) =
  withLeave (\node done -> animating done \h -> styleLeaveImpl h look ms node done)
    <<< withEnter { appear: false } (\node -> animating (pure unit) \h -> styleEnterImpl h look ms node)

-- | Fade branches and rows in and out. The preset writes its own inline
-- | `transition` and `opacity` while it runs, so the duration is stated
-- | once and no stylesheet is needed; it replaces any inline values of its
-- | own for those properties.
fade :: Milliseconds -> Element -> Element
fade = preset fadeLook

data Axis = X | Y

derive instance Eq Axis

-- | Slide branches and rows in from, and out to, one width (`X`) or height
-- | (`Y`) before their place, fading as they go. Like `fade`, it writes its
-- | own inline `transition`, `transform` and `opacity`.
slide :: { axis :: Axis, duration :: Milliseconds } -> Element -> Element
slide { axis, duration } = preset (slideLook (if axis == X then "X" else "Y")) duration

-- | Reset the enter, leave and move hooks to their defaults inside the
-- | element, so that `dyn` and `each` there do not inherit a transition
-- | from outside.
withoutTransitions :: Element -> Element
withoutTransitions = withLeave immediateLeave <<< withEnter { appear: false } noEnter <<< withMove noMove
