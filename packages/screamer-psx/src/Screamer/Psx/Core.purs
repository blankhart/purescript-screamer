-- | The hand-written core of the PSX backend for Screamer: the signature's
-- | names that are not one per element, attribute or event. `Screamer.Psx`
-- | re-exports it beside the per-name functions `psx gen-backend` writes
-- | from `backends/mappings/screamer.json`.
-- |
-- | Screamer binds signals to nodes and never re-renders, so its nodes have
-- | no message type: `Node` and `Attr` ignore their parameter, and the
-- | handlers run effects, so a view is `Markup (Effect Unit)`. Structure that
-- | changes is a signal in a hole: a `Signal String` is a text node updated
-- | in place, and a `Signal (Markup a)` (or `Signal (Node a)`) a `dyn`.
-- | Attributes take a constant or a signal of their type.
module Screamer.Psx.Core
  ( Node
  , Attr
  , Markup
  , Key
  , class ToKey
  , toKey
  , text
  , element
  , class Content
  , content
  , elementOf
  , none
  , keyed
  , attribute
  , class Children
  , children
  , root
  , onValueInput
  ) where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe, maybe)
import Data.Tuple (Tuple(..), snd)
import Effect (Effect)
import Screamer.Element as S
import Screamer.Attribute as S
import Screamer.Signal (Signal)
import Web.Event.Event (Event)

type Node :: Type -> Type
type Node a = S.Element

type Attr :: Type -> Type
type Attr a = S.Attribute

-- | What every markup literal denotes.
type Markup a = Array (Node a)

type Key = String

class ToKey k where
  toKey :: k -> Key

instance ToKey String where
  toKey = identity

instance ToKey Int where
  toKey = show

instance ToKey Number where
  toKey = show

instance ToKey Char where
  toKey = show

text :: forall a. String -> Node a
text s = S.text (pure s)

element :: forall c a. Content c a => String -> Array (Attr a) -> c -> Node a
element tag = elementOf (S.element_ tag)

-- | What an element's children are: nodes, or keyed nodes. A view runs
-- | once, so a literal's keyed children are created once and never
-- | reordered: the keys need nothing from Screamer, and are dropped. A list
-- | that changes is Screamer's own `each` in a hole.
class Content c a | c -> a where
  content :: c -> Markup a

instance Content (Array S.Element) a where
  content = identity

instance Content (Array (Tuple String S.Element)) a where
  content = map snd

-- | An element function that takes either kind of children.
elementOf :: forall c a. Content c a => (Array (Attr a) -> Markup a -> Node a) -> Array (Attr a) -> c -> Node a
elementOf build attrs = build attrs <<< content

-- | No children.
none :: forall a. Markup a
none = []

-- | Keys a child for its parent's keyed child list. A key belongs to the
-- | list, not to the element, so it is never an `Attr`: write `key` on the
-- | element in markup, never a key in a trait hole.
keyed :: forall k a. ToKey k => k -> Node a -> Tuple Key (Node a)
keyed k node = Tuple (toKey k) node

attribute :: forall a. String -> String -> Attr a
attribute name value = S.attribute name (pure value)

-- | What a child hole may hold, and the children it makes: nodes from a
-- | string, an element, markup or a signal, keyed nodes from keyed
-- | literals, and arrays and `Maybe`s of those. Screamer's nodes carry no
-- | message type, so the children are `Array S.Element` whatever a view's
-- | handlers are.
class Children c r | c -> r where
  children :: c -> r

instance Children String (Array S.Element) where
  children s = [ text s ]

instance Children S.Element (Array S.Element) where
  children n = [ n ]

instance Children (Tuple String S.Element) (Array (Tuple String S.Element)) where
  children kid = [ kid ]

-- | A text node, updated in place.
instance Children (Signal String) (Array S.Element) where
  children s = [ S.text s ]

-- | A `dyn`: each new value replaces the nodes.
instance Children (Signal S.Element) (Array S.Element) where
  children s = [ S.dyn s ]

instance Children (Signal (Array S.Element)) (Array S.Element) where
  children s = [ S.dyn (S.fragment_ <$> s) ]

instance Children c (Array x) => Children (Array c) (Array x) where
  children = Array.concatMap children

instance Children c (Array x) => Children (Maybe c) (Array x) where
  children = maybe [] children

-- | The one element a view hands to `mount` or returns from `component`:
-- | the literal's only node, or a fragment of several.
root :: forall a. Markup a -> Node a
root nodes = case nodes of
  [ node ] -> node
  _ -> S.fragment_ nodes

-- | An `input` handler given the `value` of the element the event came
-- | from, or `""` if it has none.
onValueInput :: (String -> Effect Unit) -> Attr (Effect Unit)
onValueInput f = S.on_ "input" (f <=< targetValue)

foreign import targetValue :: Event -> Effect String
