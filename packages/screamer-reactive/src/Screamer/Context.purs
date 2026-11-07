-- | Values provided to a scope and everything it owns.
-- |
-- | A context value is named by a type. Declare an empty data type for it
-- | and a `ContextKey` instance, in the same module, that gives the value's
-- | type, a name and a default:
-- |
-- | ```purescript
-- | data ThemeKey
-- |
-- | instance ContextKey ThemeKey Theme where
-- |   keyName _ = "MyApp.Theme.ThemeKey"
-- |   keyDefault _ = Light
-- |
-- | themeKey :: Proxy ThemeKey
-- | themeKey = Proxy
-- | ```
-- |
-- | Two keys are the same exactly when their types are, so a key can be
-- | written inline or shared, with the same meaning. Only the module that
-- | defines the type can give it an instance, so no other module can
-- | attach a different value type to it.
-- |
-- | `provide` runs its body in a child scope that sees the value; `ask`
-- | returns the value provided nearest above the current scope, or the
-- | key's default. Scopes created by `dyn`, `each`, `component`, `child`
-- | and `Screamer.Flatten` see what their parent sees, so a value provided
-- | at the root reaches every row and branch.
module Screamer.Context
  ( class ContextKey
  , keyName
  , keyDefault
  , Key
  , key
  , provide
  , ask
  , uniqueId
  ) where

import Effect (Effect)
import Screamer.Owned (Owned(..), Scope)
import Type.Proxy (Proxy)

-- | The key type `k` names a context value of type `a`.
-- |
-- | The runtime tells keys apart by `keyName`, so it must be a name no
-- | other key type uses: by convention, the module-qualified name of `k`.
class ContextKey :: Type -> Type -> Constraint
class ContextKey k a | k -> a where
  keyName :: Proxy k -> String
  keyDefault :: Proxy k -> a

-- | A key as the runtime sees it, for foreign code that looks a context
-- | value up itself.
type Key a = { name :: String, default :: a }

-- | The runtime form of the key type `k`.
key :: forall k a. ContextKey k a => Proxy k -> Key a
key p = { name: keyName p, default: keyDefault p }

foreign import provideImpl :: forall a b. Scope -> Key a -> a -> (Scope -> Effect b) -> Effect b

foreign import askImpl :: forall a. Scope -> Key a -> Effect a

foreign import uniqueIdImpl :: Scope -> Effect String

-- | Run the body in a child scope that sees `value` for the key. The child
-- | scope is disposed with the current one.
provide :: forall k a b. ContextKey k a => Proxy k -> a -> Owned b -> Owned b
provide k value (Owned body) = Owned \s -> provideImpl s (key k) value body

-- | The value provided for the key nearest above the current scope, else
-- | its default.
ask :: forall k a. ContextKey k a => Proxy k -> Owned a
ask k = Owned \s -> askImpl s (key k)

-- | A fresh id: `"s0"`, `"s1"`, … in the order they are asked for within
-- | one root scope, so two instantiations of the same element under fresh
-- | roots get the same ids.
uniqueId :: Owned String
uniqueId = Owned uniqueIdImpl
