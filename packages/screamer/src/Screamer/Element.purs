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
  , each
  , mount
  , instantiate
  , class IsElement
  , element
  ) where

import Prelude

import Effect (Effect)
import Screamer.Attribute (Attribute)
import Screamer.Owned (Owned(..), Scope, runOwned)
import Screamer.Signal (Signal)
import Unsafe.Coerce (unsafeCoerce)
import Web.DOM.Element as DOM
import Web.DOM.Node (Node)

-- | A DOM tree, built when instantiated.
newtype Element = Element (Owned Node)

foreign import elementImpl :: String -> Array Attribute -> Array Element -> Scope -> Effect Node

foreign import svgElementImpl :: String -> Array Attribute -> Array Element -> Scope -> Effect Node

foreign import fragmentImpl :: Array Element -> Scope -> Effect Node

foreign import textImpl :: Signal String -> Scope -> Effect Node

foreign import dynImpl :: Signal Element -> Scope -> Effect Node

foreign import eachImpl
  :: forall k a
   . (k -> k -> Int)
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
dyn s = Element (Owned (dynImpl s))

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
-- | the setup runs; defer measuring to a frame.
foreign_ :: (DOM.Element -> Owned Unit) -> String -> Array Attribute -> Element
foreign_ setup tag attrs = Element $ Owned \s -> do
  host <- elementImpl tag attrs [] s
  let Owned run = setup (unsafeCoerce host)
  run s
  pure host

-- | A keyed list. Each key gets a row scope and a row signal; kept keys
-- | update their signal in place, removed keys are disposed, and reorders
-- | move as few rows as possible.
each :: forall k a. Ord k => (a -> k) -> Signal (Array a) -> (Signal a -> Element) -> Element
each key items row = Element (Owned (eachImpl cmp key items row))
  where
  cmp a b = case compare a b of
    LT -> -1
    EQ -> 0
    GT -> 1

-- | The element's nodes, built in the current scope.
instantiate :: Element -> Owned Node
instantiate (Element o) = o

foreign import findMountPoint :: String -> Effect Node

foreign import attach :: Node -> Node -> Effect (Effect Unit)

-- | Instantiate an element under a fresh root scope and append it to the
-- | first element matching the selector. Returns an action that disposes the
-- | scope and removes the nodes.
mount :: String -> Element -> Effect (Effect Unit)
mount selector el = do
  target <- findMountPoint selector
  r <- runOwned (instantiate el)
  detach <- attach target r.value
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
