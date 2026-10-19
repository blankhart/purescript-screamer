-- | The renderer backend: the node operations `Screamer.Element` performs.
-- |
-- | Every node an element creates, moves or removes goes through the
-- | backend that the current scope's context provides under `rendererKey`.
-- | The default is `browserBackend`, over the global `document`. Another
-- | renderer (a server that builds HTML, a client that hydrates it) provides
-- | its own backend with `Screamer.Element.Unsafe.instantiateWith`.
-- |
-- | A backend is a JavaScript object; its interface is `Backend` in this
-- | module's foreign module, `src/Screamer/Renderer.ts`, which a renderer
-- | written in TypeScript can import as a type.
module Screamer.Renderer
  ( Backend
  , browserBackend
  , createBrowserBackend
  , rendererKey
  , interactive
  , delegated
  , Boundary
  , boundaryKey
  ) where

import Prelude

import Effect (Effect)
import Screamer.Context (Key, ask, key)
import Screamer.Owned (Owned)
import Screamer.Signal (Signal)
import Web.DOM.Node (Node)

-- | The node operations of one renderer.
foreign import data Backend :: Type

-- | The DOM, through the global `document`, read only when a node is made.
-- | It is interactive: listeners are attached and widgets set up. Bubbling
-- | events are delegated to one listener per type on the document.
foreign import browserBackend :: Backend

-- | A browser backend with its own delegation registry, for a renderer that
-- | must not share `browserBackend`'s listeners.
foreign import createBrowserBackend :: Effect Backend

-- | The backend of the current scope; default `browserBackend`.
rendererKey :: Key Backend
rendererKey = key "renderer" browserBackend

foreign import interactiveImpl :: Backend -> Boolean

-- | Whether the current backend responds to input. When false (on a server)
-- | `on_` attaches nothing and `foreign_` runs no setup; an owned effect
-- | that only matters to a live page, such as a listener on `window`,
-- | should check it before starting.
interactive :: Owned Boolean
interactive = interactiveImpl <$> ask rendererKey

-- | The event types the browser backend delegates to the document.
foreign import delegated :: Array String

-- | A `suspense` boundary: its anchors (what it shows lies between them)
-- | and its content's `Pending.settled` signal.
type Boundary = { start :: Node, end :: Node, settled :: Signal Boolean }

-- | Told about each `suspense` boundary when it is instantiated, before its
-- | content is built; the default does nothing. A streaming renderer
-- | provides one to learn which ranges to send late: those whose `settled`
-- | is still false when it flushes the page.
boundaryKey :: Key (Boundary -> Effect Unit)
boundaryKey = key "boundary" \_ -> pure unit
