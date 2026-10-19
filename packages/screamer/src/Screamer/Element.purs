-- | Elements: pure descriptions of DOM trees.
-- |
-- | Evaluating an `Element` runs nothing, including the setup inside
-- | `component`. Instantiating it creates the nodes and runs everything once
-- | per instance under a scope that disposes it. Two mounts of the same
-- | `Element` are independent instances.
module Screamer.Element
  ( Element(..)
  , element_
  , svgElement_
  , fragment_
  , text
  , dyn
  , component
  , foreign_
  , foreignWithFallback_
  , each
  , portal
  , catchError
  , suspense
  , withLeave
  , LeaveHook
  , mount
  , instantiate
  , class IsElement
  , element
  ) where

import Prelude

import Effect (Effect)
import Effect.Exception (Error)
import Screamer.Attribute (Attribute)
import Screamer.Context (Key, ask, key, provide)
import Screamer.Owned (Owned(..), Scope, runOwned)
import Screamer.Pending (settled)
import Screamer.Renderer (Backend, Boundary, boundaryKey, browserBackend, interactive, rendererKey)
import Screamer.Signal (Signal)
import Unsafe.Coerce (unsafeCoerce)
import Web.DOM.Element as DOM
import Web.DOM.Node (Node)

-- | A DOM tree, built when instantiated.
newtype Element = Element (Owned Node)

foreign import elementImpl :: String -> Array Attribute -> Array Element -> Scope -> Effect Node

foreign import foreignHostImpl :: String -> Array Attribute -> Scope -> Effect Node

foreign import svgElementImpl :: String -> Array Attribute -> Array Element -> Scope -> Effect Node

foreign import fragmentImpl :: Array Element -> Scope -> Effect Node

foreign import textImpl :: Signal String -> Scope -> Effect Node

foreign import dynImpl :: Key LeaveHook -> Signal Element -> Scope -> Effect Node

foreign import eachImpl
  :: forall k a
   . Key LeaveHook
  -> (k -> k -> Int)
  -> (a -> k)
  -> Signal (Array a)
  -> (Signal a -> Element)
  -> Scope
  -> Effect Node

-- | An HTML element. Static children are appended once.
element_ :: String -> Array Attribute -> Array Element -> Element
element_ tag attrs children = Element (Owned (elementImpl tag attrs children))

-- | An SVG element, created in the SVG namespace.
svgElement_ :: String -> Array Attribute -> Array Element -> Element
svgElement_ tag attrs children = Element (Owned (svgElementImpl tag attrs children))

fragment_ :: Array Element -> Element
fragment_ children = Element (Owned (fragmentImpl children))

-- | One text node, updated in place when the signal changes.
text :: Signal String -> Element
text s = Element (Owned (textImpl s))

-- | Each new value disposes the previous element's scope and nodes, then
-- | instantiates the new element in a fresh child scope.
dyn :: Signal Element -> Element
dyn s = Element (Owned (dynImpl leaveKey s))

-- | Run setup effects once per instance, in the element's scope.
component :: Owned Element -> Element
component (Owned setup) = Element $ Owned \s -> do
  Element (Owned build) <- setup s
  build s

-- | A host element for a JS widget that owns its own DOM subtree, such as
-- | an editor or a map. Each instance creates the host element with its
-- | attributes, then runs the setup on it in the instance's scope: create the
-- | widget there, destroy it in `onCleanup`, and keep it in sync with
-- | `subscribe` and event handlers that write in `batch`. Screamer never
-- | touches the host's children. The host is not yet in the document while
-- | the setup runs; defer measuring to a frame. When the backend is not
-- | interactive (`Screamer.Renderer.interactive`, false on a server) the
-- | setup does not run and the host is empty.
foreign_ :: (DOM.Element -> Owned Unit) -> String -> Array Attribute -> Element
foreign_ setup tag attrs = foreignWithFallback_ setup tag attrs []

-- | `foreign_` with children to show where the widget cannot run: when the
-- | backend is not interactive, the host holds the fallback instead and the
-- | setup does not run. When it is interactive, the host's children are
-- | cleared (a hydrating renderer finds the server's fallback there) before
-- | the setup runs.
foreignWithFallback_ :: (DOM.Element -> Owned Unit) -> String -> Array Attribute -> Array Element -> Element
foreignWithFallback_ setup tag attrs fallback = Element $ Owned \s -> do
  let Owned live = interactive
  isLive <- live s
  if isLive then do
    host <- foreignHostImpl tag attrs s
    let Owned run = setup (unsafeCoerce host)
    run s
    pure host
  else elementImpl tag attrs fallback s

-- | A keyed list. Each key gets a row scope and a row signal; kept keys
-- | update their signal in place, removed keys are disposed, and reorders
-- | move as few rows as possible.
each :: forall k a. Ord k => (a -> k) -> Signal (Array a) -> (Signal a -> Element) -> Element
each key items row = Element (Owned (eachImpl leaveKey cmp key items row))
  where
  cmp a b = case compare a b of
    LT -> -1
    EQ -> 0
    GT -> 1

foreign import portalImpl :: String -> Element -> Scope -> Effect Node

-- | Instantiate the element in the current scope, so it sees the current
-- | context and is disposed with its parent, but insert its nodes into the
-- | first element matching the selector (a modal root, say), through the
-- | backend. An empty comment stays in its place. Disposal removes the
-- | nodes from the target.
portal :: String -> Element -> Element
portal selector el = Element (Owned (portalImpl selector el))

foreign import catchErrorImpl :: (Error -> Element) -> Element -> Scope -> Effect Node

-- | An error boundary. The element runs in a child scope; when it throws
-- | while being built, or one of its effects throws later, that scope is
-- | disposed and the handler's element is shown in its place. Errors thrown
-- | by the handler's element propagate to the enclosing scope. Errors
-- | thrown by event handlers are not caught; they are not effects.
catchError :: (Error -> Element) -> Element -> Element
catchError handler el = Element (Owned (catchErrorImpl handler el))

foreign import suspenseImpl
  :: (Scope -> Effect (Signal Boolean))
  -> Key (Boundary -> Effect Unit)
  -> Element
  -> Element
  -> Scope
  -> Effect Node

-- | `suspense fallback content` builds the content, detached, in a child
-- | scope, and shows the fallback while that scope's `Pending.settled` is
-- | false. When it becomes true, the content takes the fallback's place and
-- | the fallback is disposed. Later pending work in the content does not
-- | bring the fallback back. Content that has nothing pending is shown at
-- | once, with no fallback built.
suspense :: Element -> Element -> Element
suspense fallback content = Element (Owned (suspenseImpl settledIn boundaryKey fallback content))
  where
  settledIn s = let Owned run = settled in run s

-- | How a removed branch or row leaves: given each of its top-level nodes
-- | and the action that detaches it.
type LeaveHook = Node -> Effect Unit -> Effect Unit

foreign import immediateLeave :: LeaveHook

leaveKey :: Key LeaveHook
leaveKey = key "leave" immediateLeave

-- | Delay the removal of branches of `dyn` and rows of `each` inside the
-- | element, for exit animations. When a branch or row is removed its scope
-- | is disposed at once, and each of its top-level nodes stays in the
-- | document until the hook calls the action it was given. When the scope
-- | of the `dyn` or `each` itself is disposed, nodes still leaving are
-- | removed at once.
-- |
-- | ```purescript
-- | withLeave (\node done -> fadeOut node *> after 200 done) (each ...)
-- | ```
withLeave :: LeaveHook -> Element -> Element
withLeave hook el = Element (provide leaveKey hook (instantiate el))

foreign import withBackend :: forall a. Backend -> Effect a -> Effect a

-- | The element's nodes, built in the current scope with the backend its
-- | context provides (`Screamer.Renderer.rendererKey`).
instantiate :: Element -> Owned Node
instantiate (Element (Owned build)) = Owned \s -> do
  let Owned backend = ask rendererKey
  b <- backend s
  withBackend b (build s)

foreign import findMountPoint :: Backend -> String -> Effect Node

foreign import attach :: Backend -> Node -> Node -> Effect (Effect Unit)

-- | Instantiate an element under a fresh root scope and append it to the
-- | first element matching the selector. Returns an action that disposes the
-- | scope and removes the nodes. This is
-- | `Screamer.Element.Unsafe.instantiateWith browserBackend identity`
-- | followed by appending the node.
mount :: String -> Element -> Effect (Effect Unit)
mount selector el = do
  target <- findMountPoint browserBackend selector
  r <- runOwned (provide rendererKey browserBackend (instantiate el))
  detach <- attach browserBackend target r.value
  pure (r.dispose *> detach)

-- | Types that can stand for an element.
class IsElement a where
  element :: a -> Element

instance IsElement Element where
  element = identity

instance IsElement String where
  element = text <<< pure

instance IsElement Int where
  element = text <<< pure <<< show

instance IsElement Number where
  element = text <<< pure <<< show

instance IsElement (Signal String) where
  element = text
