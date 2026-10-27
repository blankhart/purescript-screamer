# screamer-devtools

Headless development tools: the data behind a devtools panel, for tests, scripts and agents (#84). Nothing here draws anything; an overlay built on the same data is planned in #85.

| Function | What it gives |
|---|---|
| `snapshot`, `snapshotJson`, `snapshotText` | the live scope tree: each scope's path, kind, name, row key, effects, cleanups and provided context keys |
| `scopePath` | a scope's path |
| `startLog` | one row per timestep round, as JSON Lines: the writes and fires that started it and where they came from, the effects it ran, its stateful steps, the scopes it created and disposed, and its warnings and errors |
| `leaks`, `assertNoLeaks` | the scopes and effects an action left alive, by path |
| `countWork`, `expectRounds`, `expectEffectRuns` | work an action caused, in counts that do not depend on the machine |
| `withStrict` | development warnings thrown as errors |

Depends on: screamer-reactive. It reads the runtime's development hook (`setDevHook` in `Screamer.Runtime.Unsafe`), so it works only in development builds: with `__DEV__=false` snapshots are empty and the other functions throw.

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
  provide (provides Screamer.Renderer.RendererKey)
    named:App (2 effects)
      each[key=1] (1 effect)
      each[key=2] (1 effect)
      dyn
        named:Panel
```

The summary line comes first, so a reader can stop there.

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

## Diagnostic codes

| Code | Kind | Meaning |
|---|---|---|
| `SCR001` | warning | read of a paused stateful signal |
| `SCR002` | warning | one source written or fired by two writers with no stated order in one timestep (#72) |
| `SCR101` | error | write inside a derivation |
| `SCR102` | error | fire inside a derivation |
| `SCR103` | error | cycle among derived signals |
| `SCR104` | error | cycle among derived events |
| `SCR105` | error | effect loop |

Each message starts with `screamer SCRnnn:`. Under `withStrict` the warnings are thrown instead of written to the console, every time rather than once per node.

## Budgets and leaks

```purescript
expectRounds 1 (n.putT1 1)
expectEffectRuns { atMost: 3 } (click "#add")
assertNoLeaks (mount "#root" app >>= identity)
```

A failed budget or leak check throws with the counts or the leaked scopes' paths.

The JSON forms carry a `version` and may change until the package's first release.
