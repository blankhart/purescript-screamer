-- | Headless development tools (#84): the data behind a devtools panel, for
-- | tests, scripts and agents. Nothing here draws anything.
-- |
-- | - `snapshot`, `snapshotJson` and `snapshotText` show the live scope tree.
-- | - `startLog` records one row per timestep round, as JSON Lines.
-- | - `leaks` and `assertNoLeaks` report what an action left alive.
-- | - `countWork`, `expectRounds` and `expectEffectRuns` count the work an
-- |   action caused, in units that do not depend on the machine.
-- | - `withStrict` turns development warnings into errors.
-- | - `scopeOf` and `nodesOf` map between the page and the tree.
-- | - A log's `why` and `whyNot` explain why an effect ran or did not.
-- | - `setTrackOrigins` records where scopes and nodes were created, for
-- |   leak reports and `why`.
-- | - `startRecording` and `replay` capture the writes and fires a program
-- |   received and apply them to a fresh mount, in a test.
-- | - `setConsistencyCheck` checks the DOM against the signals bound to it
-- |   after every timestep.
-- | - `exposeGlobal` makes all of this available to scripts in the page as
-- |   `window.__SCREAMER_DEVTOOLS__`.
-- |
-- | All of it reads the runtime's development hook, so it works only in
-- | development builds. In a bundle built with `__DEV__=false`, snapshots
-- | and lookups are empty, `exposeGlobal` does nothing, and the other
-- | functions throw.
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
  , scopeOf
  , nodesOf
  , LiveScope
  , Leaks
  , leaks
  , assertNoLeaks
  , Work
  , countWork
  , expectRounds
  , expectEffectRuns
  , withStrict
  , withoutStrict
  , setTrackOrigins
  , setConsistencyCheck
  , Log
  , Explanation
  , LogOptions
  , LogFilter
  , startLog
  , defaultLogOptions
  , everything
  , Recording
  , Recorder
  , startRecording
  , encodeRecording
  , decodeRecording
  , RecordingSize
  , recordingSize
  , Replayed
  , replay
  , exposeGlobal
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Screamer.Owned (Scope)
import Web.DOM.Node (Node)

-- | A scope and its descendants. `key` is the `each` row key shown as text,
-- | or empty; `cleanups` counts cleanups other than effects; `context` lists
-- | the context keys the scope provides; `nodes` describes the top-level
-- | nodes its element built (`<li#id>`, a text node's text, `<!---->`).
newtype ScopeTree = ScopeTree
  { path :: String
  , kind :: String
  , name :: String
  , key :: String
  , effects :: Int
  , cleanups :: Int
  , context :: Array String
  , nodes :: Array String
  , children :: Array ScopeTree
  }

-- | The live root scopes and everything under them.
foreign import snapshot :: Effect (Array ScopeTree)

-- | `snapshot` as JSON, with a format version and a summary.
foreign import snapshotJson :: Effect String

-- | `snapshot` as indented text, one scope per line after a summary line,
-- | each followed by the nodes it built, for golden tests.
foreign import snapshotText :: Effect String

foreign import scopePathImpl :: Scope -> Effect String

-- | The path of a scope, such as `root/named:App/dyn`.
scopePath :: Scope -> Effect String
scopePath = scopePathImpl

foreign import scopeOfImpl :: (String -> Maybe String) -> Maybe String -> Node -> Effect (Maybe String)

-- | The path of the innermost live scope whose element built the node or one
-- | of its ancestors, such as the node a Playwright selector found.
scopeOf :: Node -> Effect (Maybe String)
scopeOf = scopeOfImpl Just Nothing

foreign import nodesOfImpl :: String -> Effect (Array Node)

-- | The top-level nodes the element of the scope at a path built, or none
-- | when no live scope has that path.
nodesOf :: String -> Effect (Array Node)
nodesOf = nodesOfImpl

-- | A scope an action left alive, at the top of its subtree, with the scopes
-- | and effects in that subtree. `origin` is where it was created, a few
-- | stack frames outside Screamer, when `setTrackOrigins true` was in effect,
-- | and otherwise empty.
type LiveScope =
  { path :: String
  , kind :: String
  , name :: String
  , scopes :: Int
  , effects :: Int
  , origin :: String
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

-- | Run the action and throw, listing each leaked scope's path and origin,
-- | if it left a scope or an effect alive.
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

foreign import withStrictnessImpl :: forall a. Boolean -> Effect a -> Effect a

-- | Run the action with development warnings thrown as errors (strict
-- | mode). The warning's code and message are the error's message.
withStrict :: forall a. Effect a -> Effect a
withStrict = withStrictnessImpl true

-- | Run the action with development warnings written to the console, for a
-- | test that expects one while strict mode is on (as `Screamer.Test.runSpec`
-- | turns it on).
withoutStrict :: forall a. Effect a -> Effect a
withoutStrict = withStrictnessImpl false

-- | Record a stack trace where each scope, source, stateful node and effect
-- | is created from now on, shown in leak reports and `why`. Costly: turn it
-- | on while looking for a leak.
foreign import setTrackOrigins :: Boolean -> Effect Unit

-- | After every timestep, check that each text node and attribute bound to a
-- | signal shows the signal's current value, and report a mismatch as
-- | `SCR003` (a warning, or an error under strict mode). It covers bindings
-- | made while it is on, so turn it on before mounting. Properties are not
-- | checked, since the user can change them (an input's value).
foreign import setConsistencyCheck :: Boolean -> Effect Unit

-- | A running log. `read` returns it as JSON Lines: a summary line, then one
-- | line per row. `stop` stops recording; what was recorded stays readable.
-- |
-- | `why` and `whyNot` take an effect's id from the log. `why` says what
-- | the effect's last run saw: which of its inputs had updated, and which
-- | sources upstream of it were written or fired to start that round, by
-- | whom. `whyNot` goes through each of the effect's inputs and says why it
-- | has not updated since: not written, written with an equal value, or held
-- | by a node between it and a source that did change (an equal value,
-- | `dropRepeats` or a filter).
type Log =
  { read :: LogFilter -> Effect String
  , stop :: Effect Unit
  , why :: Int -> Effect Explanation
  , whyNot :: Int -> Effect Explanation
  }

-- | An answer as a few lines of text, and as JSON.
type Explanation = { summary :: String, json :: String }

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

-- | The writes and fires a program received from outside it: from event
-- | handlers, timers and a test's own actions, rather than from its effects.
foreign import data Recording :: Type

type Recorder = { stop :: Effect Recording }

-- | Start recording, then mount the program. The recording names sources by
-- | the order they are created after it starts, which is how `replay`
-- | matches them in a fresh mount of the same program, so start it before
-- | the mount. Values that JSON cannot carry (functions, data constructors)
-- | are recorded as opaque, and skipped on replay.
foreign import startRecording :: Effect Recorder

foreign import encodeRecording :: Recording -> String

foreign import decodeRecordingImpl
  :: (String -> Either String Recording)
  -> (Recording -> Either String Recording)
  -> String
  -> Either String Recording

decodeRecording :: String -> Either String Recording
decodeRecording = decodeRecordingImpl Left Right

-- | `steps` are batches of writes, one per round they started; `opaque`
-- | writes cannot be replayed; `external` counts writes to sources created
-- | before the recording started, which it leaves out.
type RecordingSize = { steps :: Int, writes :: Int, opaque :: Int, external :: Int }

foreign import recordingSize :: Recording -> RecordingSize

type Replayed a = { value :: a, applied :: Int, skipped :: Int }

foreign import replayImpl :: forall a. Recording -> Effect a -> Effect (Replayed a)

-- | Run the mount (typically `mount "#root" app`, under a `fakeHost` for
-- | time), then apply the recording's writes and fires to the sources it
-- | creates, one batch per recorded round. It returns the mount's result,
-- | such as its unmount action, and counts what it applied and skipped.
replay :: forall a. Recording -> Effect a -> Effect (Replayed a)
replay = replayImpl

-- | In a development build, define `window.__SCREAMER_DEVTOOLS__` (on
-- | `globalThis`) for scripts in the page: `snapshotJson()`,
-- | `snapshotText()`, `scopeOf(node)`, `nodesOf(path)`, `startLog()`
-- | returning `{ read, stop, why, whyNot }`, `setStrict`, `setTrackOrigins`,
-- | `setConsistencyCheck`, and `warnings`, the newest 100 warnings. If
-- | `window.__SCREAMER_DEVTOOLS_LOG__` is true when it runs, it also starts
-- | a log as `log`. Does nothing outside development.
foreign import exposeGlobalImpl :: Effect Unit

exposeGlobal :: Effect Unit
exposeGlobal = exposeGlobalImpl
