-- | The runtime API that add-on FFI may rely on.
-- |
-- | This module's foreign module, `src/Screamer/Runtime/Unsafe.ts`, is the
-- | stable contract for foreign code outside the runtime: node constructors
-- | (`cell`, `derived`, `stateful`, `eventDerived`, ...), scopes and effects,
-- | `batch`, `sample` and `untracked`. Foreign modules import it at run time
-- | as `../Screamer.Runtime.Unsafe/foreign.js`; it is the same graph as
-- | `../Screamer.Runtime/foreign.js`. Its header comment lists the names.
-- |
-- | Nothing here is safe in the PureScript sense: the functions it exposes
-- | to JavaScript can break the runtime's invariants when misused.
module Screamer.Runtime.Unsafe
  ( development
  ) where

-- | Whether development checks (the write guard, cycle detection and the
-- | counters behind `readStats`) are compiled in. Bundles built with
-- | `--define:__DEV__=false` turn them off.
foreign import development :: Boolean
