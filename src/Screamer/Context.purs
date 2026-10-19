-- | Values provided to a scope and everything it owns.
-- |
-- | A `Key` names a value and gives its default. `provide` runs its body in
-- | a child scope that sees the value; `ask` returns the value provided
-- | nearest above the current scope, or the key's default. Scopes created
-- | by `dyn`, `each`, `component`, `child` and `Screamer.Flatten` see what
-- | their parent sees, so a value provided at the root reaches every row
-- | and branch.
module Screamer.Context
  ( Key
  , key
  , provide
  , ask
  , uniqueId
  ) where

import Prelude

import Effect (Effect)
import Screamer.Owned (Owned(..), Scope)

-- | The name of a context value of type `a`.
foreign import data Key :: Type -> Type

-- | A fresh key, with a name for messages and a default value. Each call
-- | makes a different key, even with the same name.
foreign import key :: forall a. String -> a -> Key a

foreign import provideImpl :: forall a b. Scope -> Key a -> a -> (Scope -> Effect b) -> Effect b

foreign import askImpl :: forall a. Scope -> Key a -> Effect a

foreign import uniqueIdImpl :: Scope -> Effect String

-- | Run the body in a child scope that sees `value` for the key. The child
-- | scope is disposed with the current one.
provide :: forall a b. Key a -> a -> Owned b -> Owned b
provide k value (Owned body) = Owned \s -> provideImpl s k value body

-- | The value provided for the key nearest above the current scope, else
-- | its default.
ask :: forall a. Key a -> Owned a
ask k = Owned \s -> askImpl s k

-- | A fresh id: `"s0"`, `"s1"`, … in the order they are asked for within
-- | one root scope, so two instantiations of the same element under fresh
-- | roots get the same ids.
uniqueId :: Owned String
uniqueId = Owned uniqueIdImpl
