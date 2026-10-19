-- | Low-level instantiation, for renderers built on the core.
module Screamer.Element.Unsafe
  ( instantiateWith
  ) where

import Prelude

import Effect (Effect)
import Screamer.Context (provide)
import Screamer.Element (Element, instantiate)
import Screamer.Owned (Owned, runOwned)
import Screamer.Renderer (Backend, rendererKey)
import Web.DOM.Node (Node)

-- | Instantiate an element under a fresh root scope that provides the
-- | backend, inside `setup`: a wrapper that can provide more context, such
-- | as a `Screamer.Host`, around the instantiation. Returns the root node
-- | (which the caller appends or serializes) and the action that disposes
-- | the root scope. Nothing is attached anywhere: `mount` is this with
-- | `browserBackend` and `identity`, followed by appending the node.
-- |
-- | Unsafe because the node is whatever the backend makes: a `Node` only
-- | for a DOM backend.
instantiateWith :: Backend -> (Owned Node -> Owned Node) -> Element -> Effect { node :: Node, dispose :: Effect Unit }
instantiateWith backend setup el = do
  r <- runOwned (provide rendererKey backend (setup (instantiate el)))
  pure { node: r.value, dispose: r.dispose }
