-- | Headless development tools (#84): the data behind a devtools panel, for
-- | tests, scripts and agents. Nothing here draws anything.
-- |
-- | - `snapshot`, `snapshotJson` and `snapshotText` show the live scope tree.
-- | - `startLog` records one row per timestep round, as JSON Lines.
-- | - `leaks` and `assertNoLeaks` report what an action left alive.
-- | - `countWork`, `expectRounds` and `expectEffectRuns` count the work an
-- |   action caused, in units that do not depend on the machine.
-- | - `withStrict` turns development warnings into errors.
-- |
-- | All of it reads the runtime's development hook, so it works only in
-- | development builds. In a bundle built with `__DEV__=false`, snapshots
-- | are empty and the other functions throw.
-- |
-- | Scopes are named by paths such as `root/named:App/dyn/each[key=3]`:
-- | each segment is the scope's name (`Screamer.Element.named`), else what
-- | made it (`dyn`, `each`, `portal`, `catchError`, `suspense`, `fallback`,
-- | `enter`, `leave`, `move`), else `scope`, with an `each` row's key.
-- | Siblings that share a segment get their index among them (`dyn#1`).
-- | Paths are the same for the same program and inputs, so snapshots and
-- | logs from two runs can be compared. The JSON forms carry a `version`
-- | and may change until the package's first release.
module Screamer.Devtools
  ( ScopeTree(..)
  , snapshot
  , snapshotJson
  , snapshotText
  , scopePath
  , LiveScope
  , Leaks
  , leaks
  , assertNoLeaks
  , Work
  , countWork
  , expectRounds
  , expectEffectRuns
  , withStrict
  , Log
  , LogOptions
  , LogFilter
  , startLog
  , defaultLogOptions
  , everything
  ) where

import Prelude

import Effect (Effect)
import Screamer.Owned (Scope)

-- | A scope and its descendants. `key` is the `each` row key shown as text,
-- | or empty; `cleanups` counts cleanups other than effects; `context` lists
-- | the context keys the scope provides.
newtype ScopeTree = ScopeTree
  { path :: String
  , kind :: String
  , name :: String
  , key :: String
  , effects :: Int
  , cleanups :: Int
  , context :: Array String
  , children :: Array ScopeTree
  }

-- | The live root scopes and everything under them.
foreign import snapshot :: Effect (Array ScopeTree)

-- | `snapshot` as JSON, with a format version and a summary.
foreign import snapshotJson :: Effect String

-- | `snapshot` as indented text, one scope per line after a summary line,
-- | for golden tests.
foreign import snapshotText :: Effect String

foreign import scopePathImpl :: Scope -> Effect String

-- | The path of a scope, such as `root/named:App/dyn`.
scopePath :: Scope -> Effect String
scopePath = scopePathImpl

-- | A scope an action left alive, at the top of its subtree, with the scopes
-- | and effects in that subtree.
type LiveScope =
  { path :: String
  , kind :: String
  , name :: String
  , scopes :: Int
  , effects :: Int
  }

-- | What an action left alive. `effects` is how many more effects are live
-- | than before, anywhere, including in scopes that existed before.
type Leaks = { scopes :: Array LiveScope, effects :: Int, summary :: String }

foreign import leaksImpl :: Effect Unit -> Effect Leaks

-- | Run the action and report the scopes it created that are still alive,
-- | and the change in live effects. For an action that mounts something
-- | and disposes it, anything reported is a leak.
leaks :: Effect Unit -> Effect Leaks
leaks = leaksImpl

foreign import assertNoLeaksImpl :: Effect Unit -> Effect Unit

-- | Run the action and throw, listing each leaked scope's path, if it left
-- | a scope or an effect alive.
assertNoLeaks :: Effect Unit -> Effect Unit
assertNoLeaks = assertNoLeaksImpl

-- | Work an action caused: timestep rounds, effect runs, stateful steps,
-- | writes to signal sources, fires of event sources, and scopes created
-- | and disposed. None of these depend on the machine, so they can be
-- | asserted as budgets.
type Work =
  { rounds :: Int
  , effectRuns :: Int
  , steps :: Int
  , writes :: Int
  , fires :: Int
  , scopesCreated :: Int
  , scopesDisposed :: Int
  }

foreign import countWorkImpl :: Effect Unit -> Effect Work

-- | Run the action and count the work it caused.
countWork :: Effect Unit -> Effect Work
countWork = countWorkImpl

foreign import describeWork :: Work -> String

foreign import failWork :: String -> Effect Unit

-- | Run the action and throw unless it took exactly this many rounds.
expectRounds :: Int -> Effect Unit -> Effect Unit
expectRounds n action = do
  w <- countWork action
  unless (w.rounds == n) $ failWork $ "expected " <> show n <> " rounds, got " <> describeWork w

-- | Run the action and throw if it ran effects more than `atMost` times.
expectEffectRuns :: { atMost :: Int } -> Effect Unit -> Effect Unit
expectEffectRuns { atMost } action = do
  w <- countWork action
  unless (w.effectRuns <= atMost) $ failWork $ "expected at most " <> show atMost <> " effect runs, got " <> describeWork w

foreign import withStrictImpl :: forall a. Effect a -> Effect a

-- | Run the action with development warnings thrown as errors (strict
-- | mode). The warning's code and message are the error's message.
withStrict :: forall a. Effect a -> Effect a
withStrict = withStrictImpl

-- | A running log. `read` returns it as JSON Lines: a summary line, then one
-- | line per row. `stop` stops recording; what was recorded stays readable.
type Log = { read :: LogFilter -> Effect String, stop :: Effect Unit }

-- | `limit` is how many rows the log keeps, dropping the oldest; `timings`
-- | adds each round's duration in milliseconds, which differs between runs.
type LogOptions = { limit :: Int, timings :: Boolean }

defaultLogOptions :: LogOptions
defaultLogOptions = { limit: 1000, timings: false }

-- | Rows about the scope at a path and its descendants, or all rows when
-- | the path is empty.
type LogFilter = { under :: String }

everything :: LogFilter
everything = { under: "" }

foreign import startLogImpl :: LogOptions -> Effect Log

-- | Start recording one row per timestep round: the writes and fires that
-- | started it and where they came from, the effects it ran and their
-- | scopes, the stateful steps it took, the scopes it created and disposed,
-- | and the warnings and errors reported in it. Errors are reported even
-- | when an error boundary catches them. A warning or error outside every
-- | round is a row of its own. Sources and effects are numbered in the
-- | order the log first sees them.
startLog :: LogOptions -> Effect Log
startLog = startLogImpl
