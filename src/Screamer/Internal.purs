module Screamer.Internal where

import Effect (Effect)
import Data.Nullable (Nullable)
import Data.Unit (Unit)

-- Unsafe accessor for JavaScript object property
foreign import property :: forall a b c . a -> b -> c

-- Implementation of effectful method in Event classes calling FFI
foreign import eventEffect :: forall event . String -> event -> Effect Unit

-- Cast event to e if it has the given String type
foreign import eventCast :: forall event e . String -> event -> Nullable e
