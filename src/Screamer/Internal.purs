module Screamer.Internal where

-- Unsafe accessor for JavaScript object property
foreign import property :: forall a b c . a -> b -> c
