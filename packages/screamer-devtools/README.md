# screamer-devtools

Headless development tools: the data behind a devtools panel, for tests, scripts and agents (#84). Nothing here draws anything; an overlay built on the same data is planned in #85.

| Function | What it gives |
|---|---|
| `snapshot`, `snapshotJson`, `snapshotText` | the live scope tree: each scope's path, kind, name, row key, effects, cleanups, provided context keys and the top-level nodes it built |
| `scopePath`, `scopeOf`, `nodesOf` | a scope's path; the innermost scope that built a DOM node; the nodes the scope at a path built |
| `startLog` | one row per timestep round, as JSON Lines: the writes and fires that started it and where they came from, the effects it ran, its stateful steps, the scopes it created and disposed, and its warnings and errors |
| `leaks`, `assertNoLeaks` | the scopes and effects an action left alive, by path |
| `countWork`, `expectRounds`, `expectEffectRuns` | work an action caused, in counts that do not depend on the machine |
| log's `why`, `whyNot` | why an effect ran, and why it has not |
| `setTrackOrigins` | where each scope, source and effect is created, shown in leak reports and `why` |
| `startRecording`, `encodeRecording`, `decodeRecording`, `replay` | the writes a program received, replayed into a fresh mount in a test |
| `setConsistencyCheck` | after every timestep, each bound text node and attribute checked against its signal (`SCR003`) |
| `withStrict`, `withoutStrict` | development warnings thrown as errors, or not |
| `exposeGlobal` | all of the above as `window.__SCREAMER_DEVTOOLS__`, for Playwright and `npm run inspect` |

Depends on: screamer-reactive and web-dom. It reads the runtime's development hook (`setDevHook` in `Screamer.Runtime.Unsafe`), so it works only in development builds: with `__DEV__=false` snapshots and lookups are empty, `exposeGlobal` does nothing, and the other functions throw.

## Scope paths

A path names a scope by what made it, so it is the same for the same program and inputs:

```
root/provide/named:App/each[key=2]
```

Each segment is the scope's name if it has one (`Screamer.Element.named "App"` gives `named:App`), else what made it (`provide`, `dyn`, `each`, `portal`, `catchError`, `suspense`, `fallback`, `watch`, `enter`, `leave`, `move`), else `scope`, with an `each` row's key. Keys that are strings, numbers or booleans are shown; others are `<opaque>`. Siblings that share a segment get their index among them (`dyn#1`).

## Text snapshots

```purescript
unmount <- mount "#root" $ named "App" $ element_ "div" []
  [ element_ "ul" [] [ each identity items.signal li ]
  , dyn (shown.signal <#> \b -> if b then named "Panel" (text (pure "on")) else text (pure "off"))
  ]
snapshotText
```

```
1 root, 7 scopes, 4 effects
root
  provide (provides Screamer.Renderer.RendererKey) <div>
    named:App (2 effects) <div>
      each[key=1] (1 effect) <li>
      each[key=2] (1 effect) <li>
      dyn "on"
        named:Panel "on"
```

The summary line comes first, so a reader can stop there. Each scope is followed by the top-level nodes its element built: `<tag#id>`, a text node's text, or `<!---->`.

`scopeOf node` gives the path of the innermost scope that built the node or one of its ancestors, such as the node a Playwright selector found, and `nodesOf path` gives the nodes back.

## The log

```purescript
log <- startLog defaultLogOptions
-- interact
log.read everything          -- or { under: "root/provide/named:App" }
```

```
{"summary":{"version":1,"rounds":1,"rows":1,"dropped":0,"warnings":0,"errors":0}}
{"round":0,"writes":[{"source":0,"by":null}],"fires":[],"effects":[{"effect":0,"scope":"root/provide"}],"scopes":{"created":0,"disposed":0},"steps":0,"warnings":[],"errors":[]}
```

Writes and fires are listed in the round they start, with the path of the scope or effect that made them (`null` for an event handler). Sources and effects are numbered in the order the log first sees them. The log keeps the newest `limit` rows; timings are off unless `timings` is true, so two logs of one run are equal. Errors appear even when an error boundary catches them.

### Why an effect ran, or did not

The log numbers effects, and `log.why id` and `log.whyNot id` explain them:

```
effect 0 in root/provide last ran in round 0 because derived signal 4 updated, which follows signal source 3 written by an event handler
```

```
effect 1 in root/provide has not run since it was created:
  stateful signal (Signal.dropRepeatsBy) 5: upstream signal source 3 changed since, but this node did not update (an equal value, dropRepeats or a filter)
```

`why` lists the inputs whose versions changed before the run, and the sources upstream of the effect that were written or fired to start that round, with who wrote them. `whyNot` goes through the effect's inputs: one that has updated (the effect runs next round), a source not written since, a source written with the value it had, or a node that held back an upstream change. Each answer is also JSON (`json`). With `setTrackOrigins true`, `why` adds where the effect was created.

## Creation sites

`setTrackOrigins true` records a stack trace where each scope, signal source, event source, stateful node and effect is created, and leak reports and `why` show its first frames outside the runtime. PureScript's `Effect` runs code as thunks, so the frames often name the Screamer primitive that made a scope (`mount`, `dyn`, `each`) and the component modules around it rather than the line of a test. Capturing stacks is slow; turn it on while looking for something.

## Recordings

```purescript
recorder <- startRecording
unmount <- mount "#root" app
-- interact
recording <- recorder.stop
encodeRecording recording   -- save it with the bug report

-- later, in a test:
r <- replay recording (mount "#root" app)
innerHTML "#root" >>= shouldEqual "..."
```

A recording holds the writes and fires made from outside every scope and effect (event handlers, timers, a test's own actions), grouped by the round they started. It names sources by the order they are created after it starts, so start it before the mount: `replay` mounts the program again, numbers the sources it creates the same way, and applies each recorded round in one batch. Writes made by effects are not recorded, since the replay makes them again. Values JSON cannot carry (functions, data constructors) are recorded as opaque and skipped, and writes to sources created before the recording started are counted as `external` and left out. Requests, sockets and other effects outside the program are not replayed; use `fakeHost` for time.

## Consistency check

`setConsistencyCheck true`, before mounting, makes each text node and attribute bound to a signal register a check; after every timestep the runtime runs them and reports a node that does not show its signal's current value as `SCR003`, with the binding's scope. Code written against `Runtime.Unsafe` or `Element.Unsafe`, or a script that edits the DOM, can break this silently. Properties are not checked, since the user changes some of them (an input's value).

## In the page

`exposeGlobal` defines `window.__SCREAMER_DEVTOOLS__` in development builds, with `snapshotJson()`, `snapshotText()`, `scopeOf(node)`, `nodesOf(path)`, `startLog()` (returning `{ read, stop, why, whyNot }`), `setStrict`, `setTrackOrigins`, `setConsistencyCheck`, and `warnings`, the newest 100. If `window.__SCREAMER_DEVTOOLS_LOG__` is true before it runs, it starts a log as `log`. The examples call it, so a Playwright script can `page.evaluate(() => __SCREAMER_DEVTOOLS__.snapshotText())`, and

```
npm run inspect -- HelloWorld [script.mjs] [--text]
```

mounts an example in headless Chromium, runs the script's default export on the page, and prints the tree, the log from the first mount, the warnings and the page's errors as JSON.

## Diagnostic codes

| Code | Kind | Meaning |
|---|---|---|
| `SCR001` | warning | read of a paused stateful signal |
| `SCR002` | warning | one source written or fired by two writers with no stated order in one timestep (#72) |
| `SCR003` | warning | a bound text node or attribute does not show its signal's value (`setConsistencyCheck`) |
| `SCR101` | error | write inside a derivation |
| `SCR102` | error | fire inside a derivation |
| `SCR103` | error | cycle among derived signals |
| `SCR104` | error | cycle among derived events |
| `SCR105` | error | effect loop |

Each message starts with `screamer SCRnnn:`. Under `withStrict` the warnings are thrown instead of written to the console, every time rather than once per node. `Screamer.Test.runSpec` turns strict mode on for every test; `withoutStrict` (here or in `Screamer.Test`) turns it off around code that warns on purpose.

## Budgets and leaks

```purescript
expectRounds 1 (n.putT1 1)
expectEffectRuns { atMost: 3 } (click "#add")
assertNoLeaks (mount "#root" app >>= identity)
```

A failed budget or leak check throws with the counts or the leaked scopes' paths.

The JSON forms carry a `version` and may change until the package's first release.
