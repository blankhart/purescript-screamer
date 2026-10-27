-- | Animations with the Web Animations API: on a node, as enter and leave
-- | hooks, as FLIP for `each` reorders, and as crossfades between lists.
-- |
-- | An animation is owned by the scope it starts in: it is cancelled when
-- | the scope is disposed. Its end is `animation.finished`, so it needs no
-- | timeout. Where motion is reduced (`Screamer.Motion.ReducedMotion`), or
-- | the browser has no `Element.animate`, nothing animates and a leave
-- | finishes at once.
module Screamer.Motion.Animate
  ( Keyframe
  , keyframe
  , AnimationOptions
  , animate
  , leaveWith
  , flipMoves
  , CrossfadeOptions
  , Crossfade
  , crossfade
  ) where

import Prelude

import Data.Map (Map)
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Newtype (un)
import Data.Traversable (traverse)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (Element(..), EnterHook, LeaveHook, instantiate, withEnter, withLeave, withMove)
import Screamer.Host (host)
import Screamer.Motion.Internal (animating)
import Screamer.Motion.ReducedMotion (reducedMotionNow)
import Screamer.Owned (Owned(..), onCleanup)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (batch)
import Type.Row.Homogeneous (class Homogeneous)
import Unsafe.Coerce (unsafeCoerce)
import Web.DOM.Element (DOMRect)
import Web.DOM.Node (Node)

-- | One keyframe: CSS properties by their camel-case names, and
-- | optionally `offset` and `easing`.
foreign import data Keyframe :: Type

-- | A keyframe from a record of strings, as in
-- | `keyframe { opacity: "0", transform: "scale(0.9)" }`.
keyframe :: forall r. Homogeneous r String => Record r -> Keyframe
keyframe = unsafeCoerce

-- | The duration, and a CSS easing such as `"ease-out"` or
-- | `"cubic-bezier(0.2, 0, 0, 1)"`.
type AnimationOptions = { duration :: Milliseconds, easing :: String }

foreign import animateImpl
  :: Array Keyframe
  -> { duration :: Number, easing :: String, fill :: String }
  -> Node
  -> Effect Unit
  -> Effect (Effect Unit)

foreign import isElement :: Node -> Boolean

foreign import measure :: Node -> Effect DOMRect

foreign import hide :: Node -> Effect (Effect Unit)

run :: String -> Array Keyframe -> AnimationOptions -> Node -> Effect Unit -> Owned Unit
run fill frames opts node finished =
  animating finished \_ -> animateImpl frames { duration: un Milliseconds opts.duration, easing: opts.easing, fill } node finished

-- | Animate the node through the keyframes, once, cancelling the animation
-- | when the current scope is disposed. Its styles are dropped at the end.
-- | This is an `EnterHook`: `withEnter { appear: false } (animate frames opts)`.
animate :: Array Keyframe -> AnimationOptions -> Node -> Owned Unit
animate frames opts node = run "none" frames opts node (pure unit)

-- | A leave hook that animates the node through the keyframes, holds the
-- | last one, and detaches the node when the animation finishes.
leaveWith :: Array Keyframe -> AnimationOptions -> LeaveHook
leaveWith frames opts node done = run "forwards" frames opts node done

translate :: Number -> Number -> String
translate dx dy = "translate(" <> show dx <> "px, " <> show dy <> "px)"

-- | Animate the reorders of `each` lists inside the element: a row that
-- | moves, or is displaced by rows added or removed around it, slides from
-- | where it was to its new place (Svelte's `animate:flip`). A move that
-- | interrupts another starts from where the row is shown.
flipMoves :: AnimationOptions -> Element -> Element
flipMoves opts = withMove \m -> do
  let
    dx = m.before.left - m.after.left
    dy = m.before.top - m.after.top
  unless (dx == 0.0 && dy == 0.0) $
    animate [ keyframe { transform: translate dx dy }, keyframe { transform: "none" } ] opts m.node

type CrossfadeOptions = { duration :: Milliseconds, easing :: String }

-- | Marks a row as one side of a crossfade, under the key the signal
-- | holds when the row leaves or enters.
type Crossfade k = { send :: Signal k -> Element -> Element, receive :: Signal k -> Element -> Element }

type Seen = { id :: Int, rect :: DOMRect }

-- | Node tags: which key a node was sent or received under.
foreign import data Tags :: Type -> Type

foreign import newTags :: forall a. Effect (Tags a)

foreign import tag :: forall a. Tags a -> Node -> a -> Effect Unit

foreign import tagOfImpl :: forall a. (a -> Maybe a) -> Maybe a -> Tags a -> Node -> Effect (Maybe a)

tagOf :: forall a. Tags a -> Node -> Effect (Maybe a)
tagOf = tagOfImpl Just Nothing

-- | Shared-element transitions between lists (Svelte's `crossfade`). The
-- | body gets `send` and `receive`; mark the rows of one list with
-- | `send key` and those of another with `receive key`. When a row with
-- | some key leaves and another with the same key enters, in the same
-- | round, the entering row grows from the leaving row's place while the
-- | leaving one moves toward it, each crossfading. A row with no
-- | counterpart fades. Both wait one frame to find their counterpart;
-- | where motion is reduced, neither waits.
-- |
-- | ```purescript
-- | crossfade opts \{ send, receive } -> element_ "div" []
-- |   [ element_ "ul" [] [ each _.id todo \t -> send (_.id <$> t) (item t) ]
-- |   , element_ "ul" [] [ each _.id done \t -> receive (_.id <$> t) (item t) ]
-- |   ]
-- | ```
-- |
-- | It installs the leave and enter hooks of the `dyn`s and `each`es in
-- | the body, so rows there that are not marked leave and enter without
-- | animation, whatever an enclosing transition says.
crossfade :: forall k. Ord k => CrossfadeOptions -> (Crossfade k -> Element) -> Element
crossfade opts body = Element do
  sending <- liftEffect $ Ref.new (Map.empty :: Map k Seen)
  receiving <- liftEffect $ Ref.new (Map.empty :: Map k Seen)
  sent <- liftEffect newTags
  received <- liftEffect newTags
  nextId <- liftEffect $ Ref.new 0
  reduced <- reducedMotionNow
  let
    -- The node's key, unless it is not marked or motion is reduced.
    keyOf :: Tags (Signal k) -> Node -> Owned (Maybe k)
    keyOf tags node = liftEffect do
      r <- reduced
      if r then pure Nothing else tagOf tags node >>= traverse readT0

    marking :: Tags (Signal k) -> Signal k -> Element -> Element
    marking tags key el = Element do
      node <- instantiate el
      liftEffect $ tag tags node key
      pure node

    -- Record the node's rect under the key until the scope ends or `forget` runs.
    register :: Ref.Ref (Map k Seen) -> k -> Node -> Owned { rect :: DOMRect, forget :: Effect Unit }
    register table k node = do
      rect <- liftEffect $ measure node
      id <- liftEffect $ Ref.modify' (\i -> { state: i + 1, value: i }) nextId
      liftEffect $ Ref.modify_ (Map.insert k { id, rect }) table
      let forget = Ref.modify_ (Map.update (\seen -> if seen.id == id then Nothing else Just seen) k) table
      onCleanup forget
      pure { rect, forget }

    toward :: DOMRect -> DOMRect -> String
    toward from to =
      translate (to.left - from.left) (to.top - from.top)
        <> " scale("
        <> show (ratio to.width from.width)
        <> ", "
        <> show (ratio to.height from.height)
        <> ")"

    ratio a b = if b == 0.0 then 1.0 else a / b

    sendHook :: LeaveHook
    sendHook node done = keyOf sent node >>= case _ of
      Nothing -> liftEffect done
      Just k -> do
        me <- register sending k node
        nextFrame do
          other <- liftEffect $ Map.lookup k <$> Ref.read receiving
          let
            frames = case other of
              Just them ->
                [ keyframe { transformOrigin: "top left", transform: "none", opacity: "1" }
                , keyframe { transformOrigin: "top left", transform: toward me.rect them.rect, opacity: "0" }
                ]
              Nothing -> [ keyframe { opacity: "1" }, keyframe { opacity: "0" } ]
          leaveWith frames opts node done

    receiveHook :: EnterHook
    receiveHook node = keyOf received node >>= case _ of
      Nothing -> pure unit
      Just k -> do
        me <- register receiving k node
        shown <- liftEffect $ hide node
        onCleanup shown
        nextFrame do
          liftEffect shown
          other <- liftEffect $ Map.lookup k <$> Ref.read sending
          let
            frames = case other of
              Just them ->
                [ keyframe { transformOrigin: "top left", transform: toward me.rect them.rect, opacity: "0" }
                , keyframe { transformOrigin: "top left", transform: "none", opacity: "1" }
                ]
              Nothing -> [ keyframe { opacity: "0" }, keyframe { opacity: "1" } ]
          run "none" frames opts node me.forget
  instantiate $ withLeave sendHook $ withEnter { appear: false } receiveHook $
    body { send: marking sent, receive: marking received }

-- | Run the body one frame from now, in the current scope, unless the
-- | scope is disposed first.
nextFrame :: Owned Unit -> Owned Unit
nextFrame (Owned body) = Owned \s -> do
  let Owned getHost = host
  h <- getHost s
  cancel <- h.requestFrame \_ -> batch (body s)
  let Owned clean = onCleanup cancel
  clean s
