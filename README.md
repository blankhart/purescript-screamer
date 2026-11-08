# Screamer

Screamer is a PureScript library for building DOM interfaces without a virtual DOM. Signals describe values that change over time. Elements bind those signals to the DOM nodes they affect, so an update touches only those nodes.

```purescript
counter :: Element
counter = component do
  count <- liftEffect $ signalSource 0
  pure $ E.div_ [ A.class_ "counter" ]
    [ E.button_ [ H.onClick_ \_ -> count.modifyT1 (_ - 1) ] [ element "-" ]
    , E.span_ [] [ text (show <$> count.signal) ]
    , E.button_ [ H.onClick_ \_ -> count.modifyT1 (_ + 1) ] [ element "+" ]
    ]

main :: Effect Unit
main = void $ mount "main" counter
```

## Packages

One spago workspace, one version. An app depends on `screamer`, plus any add-ons it uses:

```yaml
package:
  dependencies:
    - screamer
    - screamer-combinators   # Time, Flatten, Event.Extra, Signal.Extra
    - screamer-resource      # Resource
```

| Package | Modules | For |
|---|---|---|
| [`screamer-reactive`](packages/screamer-reactive) | `Screamer.Signal`, `.Event`, `.Source`, `.Owned`, `.Context`, `.Host`, `.Pending`, `.Runtime` | the reactive core, with no DOM and no `web-*` dependency |
| [`screamer`](packages/screamer) | `Screamer`, `Screamer.Element`, `.Attribute`, `.Html`, `.Html.Attributes`, `.Html.Handlers`, `.Svg` | elements |
| [`screamer-combinators`](packages/screamer-combinators) | `Screamer.Event.Extra`, `.Signal.Extra`, `.Time`, `.Flatten` | more operators, timers and owned flattening |
| [`screamer-resource`](packages/screamer-resource) | `Screamer.Resource` | requests as signals |
| [`screamer-web`](packages/screamer-web) | `Screamer.Web.WebSocket`, `.Web.Page`, `.Web.Storage`, `.Web.MediaQuery`, `.Web.Observers` | sockets, online/visibility signals, storage, media queries and DOM observers |
| [`screamer-router`](packages/screamer-router) | `Screamer.Router`, `.Router.Windrose` | the location as a signal |
| [`screamer-forms`](packages/screamer-forms) | `Screamer.Form` | formlets |
| [`screamer-motion`](packages/screamer-motion) | `Screamer.Motion`, `.Motion.Transition`, `.Motion.Animate`, `.Motion.Value`, `.Motion.ViewTransition`, `.Motion.ReducedMotion` | enter, leave and move animations, crossfades, tweens and springs |
| [`screamer-devtools`](packages/screamer-devtools) | `Screamer.Devtools` | headless inspection: scope tree snapshots, timestep log, leak checks, work budgets and strict mode |
| [`screamer-test`](packages/screamer-test) | `Screamer.Test`, `.Test.Dom`, `.Test.Clock`, `.Test.Setup` | test helpers and Node DOM/CSS bootstrap |

`npm run build` builds them all, and `npm test` runs every package's tests.

### Installing from the release branch

The FFI is written in TypeScript, and `tsc` compiles each `.ts` to the `.js` beside it that spago builds against. Only the `release` branch commits that `.js`, so an app depends on a release tag, listing `screamer-reactive` and each add-on it uses:

```yaml
workspace:
  extraPackages:
    screamer-reactive:
      git: https://github.com/blankhart/purescript-screamer.git
      ref: v0.1.0
      subdir: packages/screamer-reactive
    screamer:
      git: https://github.com/blankhart/purescript-screamer.git
      ref: v0.1.0
      subdir: packages/screamer
```

### Releasing

1. `npm run set-version -- 0.2.0` sets the version in every `packages/*/spago.yaml` and in `package.json`. Commit that to master.
2. Run the **Release** workflow from the Actions tab with the same version. It runs `scripts/release.mjs`, which builds and tests, commits master's tree plus the compiled `.js` onto `release`, tags it `v0.2.0` and pushes both.

`npm run release -- 0.2.0` does the same locally, and pushes only with `--push`.

The examples are in `examples/src`. Run `npm run build:examples` to compile them, optimize the compiled code with [purs-backend-optimizer](https://github.com/aristanetworks/purescript-backend-optimizer) (into `output-es`), and bundle each one with esbuild into `examples/output`, which also gets an `index.html` showing a gallery of them and the stylesheet from `examples/static`. `npm run serve` serves that page at http://localhost:8080/ (`npm run serve:rainbow` opens the rainbow spiral directly), and `npm run test:smoke` checks the examples in headless Chromium.

## Building for production

Development checks are enabled by default. When bundling an application for
production, define the JavaScript identifier `__DEV__` as the boolean `false`.
For esbuild:

```javascript
await esbuild.build({
  entryPoints: ['app.js'], // imports the compiled PureScript main and calls it
  bundle: true,
  platform: 'browser',
  outfile: 'dist/app.js',
  minify: true,
  define: { __DEV__: 'false' },
});
```

The define value is JavaScript source text: `'false'` becomes a boolean in the
bundle. Setting `NODE_ENV=production` alone does not turn Screamer checks off.
This disables development consistency checks, warnings, graph counters,
creation-site tracking and devtools hooks, and lets the bundler remove their
unused code. Devtools inspection is unavailable in that build. Signal/event
propagation and resource ownership still operate normally.

Keep `__DEV__` enabled for tests (or leave it undefined), so strict warnings,
leak assertions and other diagnostics remain effective. The regular example
builds keep it on; `npm run bench` uses the production define for measurements.

## How ownership works

**Signals are pure values.** `Signal a` is a value that changes over time. `map`, `apply`, `bind`, `sampleOn` and `sampleManyWith` build new signals without touching the reactive graph. A derived signal connects to its sources only while something observes it, and it is garbage-collected like any other value when nothing refers to it. When a signal updates is part of its meaning: a signal source updates when it is written a different value, and a derived signal updates whenever an argument does, whatever it computes, so `f <$> s` updates exactly when `s` does. To stop updates that repeat a value, as before `dyn` or `resource`, use `dropRepeats`, which is stateful and so made in `Owned`.

**State is created in `Owned`.** `merge`, `latestWhere`, `gate`, `withPrevious`, `dropRepeats` and `history` keep state, as do `Event.fold`, `stepper`, `take` and the other operators that remember past occurrences. Each returns `Owned`, as in `count <- Event.fold (+) 0 clicks`: its state starts from the seed when the action runs, it belongs to the current scope, and it steps for the scope's whole life, whether or not anything displays it, until the scope is disposed. Because state does not depend on who observes it, every signal and event is a plain value that can be shared or inlined without changing what a program does, and a pure function such as the one given to `>>=` can only refer to state that already exists.

**Sources are where change comes from.** `signalSource x` (in `Effect`, from `Screamer.Source`) gives `{ signal, readT1, putT1, modifyT1 }`. Names that read or write say which timestep they act on: T0 is the current one, T1 the next. `readT0` reads a signal's value in the current timestep; `putT1` and `modifyT1` take effect when the next one starts, and `readT1` gives the value it will start with. Writes made inside `batch` (an event handler is one) are delivered together, when the outermost batch returns.

**Events sit next to signals.** A signal always has a current value. An `Event` (`Screamer.Event`, imported qualified) carries occurrences instead, such as clicks or messages, and delivers every one, in fire order, even repeats and several in one batch. `eventSource` (in `Effect`, from `Screamer.Source`) gives `{ event, fireT1 }`, and a typed handler takes `fireT1` directly. `Event.fold`, `stepper`, `changes`, `tag`, `attachWith` and `Event.subscribe` connect events and signals.

**Effects have owners.** Only effects (DOM bindings, `subscribe`, `hold`, stateful nodes, `dyn`, `each`) are attached to the graph for as long as they live. Each one belongs to a scope. `Owned` is the monad for code that creates them: `Signal.subscribe`, `Signal.hold`, `Event.subscribe`, `Event.hold`, `onCleanup`, `child` and `onError` all run in a scope. Disposing a scope disposes its children, newest first, and then runs its own cleanups in reverse order.

**`component` runs setup once per instance.** `component :: Owned Element -> Element` runs its setup when the element is instantiated. Sources, timers and subscriptions created there belong to that instance, and they are released when the instance is removed: by `dyn` switching branches, by `each` dropping a row, or by unmounting.

**`mount` returns unmount.** `mount :: String -> Element -> Effect (Effect Unit)` renders into the first element matching the selector. The action it returns removes the nodes and disposes every effect the tree created.

**Subscriptions and resources are owned too.** `Screamer.Time` (`clock`, `interval`, `after`, `frames`), `Screamer.Web.WebSocket` (`connect`) and `Screamer.Router` (`location`, `navigate`, `link`) start when their scope runs and stop when it is disposed. `Router` only tracks the location; `Screamer.Router.Windrose` matches it with [windrose-router](https://github.com/blankhart/purescript-windrose-router), whose routes are a type, and the Router example builds its links the same way. `Screamer.Resource.resource` runs an `Aff` request for each value of an input signal and gives a `Signal (Remote b)`. When the input changes or the scope is disposed, the running request is killed, and its result is never shown.

**Context, Host and Pending.** `Screamer.Context` provides values to a scope and everything under it (`provide` and `ask`, with keys named by types through `ContextKey`) and gives stable ids (`uniqueId`). `Screamer.Host` is the clock, timers and frames as a context value: `Screamer.Time` and `Resource.retry` use it, and a test can `withHost` a fake one and move time itself. `Screamer.Pending.settled` is true when no request is running anywhere under the current scope.

**Typed DOM.** `Screamer.Html`, `Screamer.Html.Attributes`, `Screamer.Html.Handlers` and `Screamer.Svg` are generated from `codegen/data.ts` (run `npm run codegen:dom`). Attributes take either a plain value or a `Signal` of the right type, enumerated attributes take an ADT, `style_` takes a record checked against the known CSS properties, and event handlers receive the specific event type. Bubbling events are delegated to one listener per type on the document.

**Formlets.** `Screamer.Form` (in screamer-forms) builds forms the way Lumi Components' `FormBuilder` does. A `Form props i o` edits a state `i` and validates it into an `o`, and forms combine with `Applicative` (`ado` notation). `prop` focuses a form on one field of a record state, `indent` labels it, and `validated` checks it with a `Validator a b = a -> Either String b`, showing the message only once the field has been edited (its state is `Validated a`) or the form has been revealed. The fields are `textbox`, `password`, `number`, `checkbox` and `select`. `build` creates the state source in the current scope and returns the element, the `Signal (Either (Array String) o)` result, and `reveal` and `reset` actions. `wizard` shows a `Wizard`, a monad of `step`s, one step at a time. See `examples/src/Formlets.purs`.

**Embedding JS widgets.** A widget that owns its DOM subtree (an editor, a map, a chart) goes in `foreign_ setup tag attrs`, which creates the host element and runs `setup host :: Owned Unit` once per instance. Create the widget there and destroy it in `onCleanup`. Sync both ways with guards: push a signal in with `subscribe`, skipping values equal to what the widget already shows so the user's edits do not loop back; report the widget's own changes out through a callback wrapped in `batch`, ignoring changes the wrapper made itself. Screamer never touches the host's children. `foreignWithFallback_` adds children shown where the widget cannot run, such as on a server renderer, whose backend is not interactive. See `examples/src/CodeMirror.purs`.

See [the `dyn` and inputs guide](packages/screamer/README.md#dyn-and-inputs) for keeping editable controls focused while the model changes.

**Motion.** Only `dyn` and `each` know when a node is added, moved or removed, so the core has one seam for each: `withEnter`, `withMove` and `withLeave` provide hooks to every `dyn` and `each` inside an element. A leave hook keeps the node in place until it calls `done`, and runs in a scope of its own, so its timers and animations end with the leave. `Screamer.Motion` (in screamer-motion) builds on them: CSS-class transitions (`transition`, with `fade` and `slide` presets), the Web Animations API (`animate`, `leaveWith`), FLIP reorders (`flipMoves`), shared-element `crossfade`s between lists, animated values that stop requesting frames once they settle (`tween`, `spring`), and `viewTransition`. Durations are always stated, never read from computed styles, and everything honours `prefers-reduced-motion` by default. See `examples/src/Motion.purs`.

**Development tools.** In development builds the runtime reports scopes, effect runs, rounds, writes, warnings and errors to one optional hook, and every warning has a stable code (`SCR001` for a read of a paused stateful signal, `SCR002` for unordered writes in one timestep, `SCR003` for a failed consistency check, `SCR004` for a `dyn` rebuild that removes focus, `SCR1xx` for the errors). `Screamer.Devtools` (in screamer-devtools) turns that into data a test, a script or an agent can read: `snapshotText` and `snapshotJson` print the live scope tree and the nodes each scope built, with deterministic paths such as `root/provide/named:App/each[key=3]` (`named` in `Screamer.Element` names a subtree); `scopeOf` and `nodesOf` map between the page and those paths; `startLog` records one JSON Lines row per round, and its `why` and `whyNot` explain why an effect ran or did not; `assertNoLeaks` fails with each leaked scope's path and, with `setTrackOrigins`, where it was created; `expectRounds` and `expectEffectRuns` assert work budgets; `startRecording` and `replay` turn a sequence of inputs into a test; and `setConsistencyCheck` checks the DOM against its signals after every timestep. `Screamer.Test.runSpec` runs tests in strict mode, where warnings are errors. The examples expose the same data as `window.__SCREAMER_DEVTOOLS__`, and `npm run inspect -- <Example> [script.mjs]` prints it for one example in headless Chromium. A visual overlay is planned in #85.

## Examples

### References

* The rainbow spiral example is a port of [sinuous-rainbow-spiral](https://github.com/luwes/sinuous-rainbow-spiral).

* `bench/` runs the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) operations, measured as upstream measures them, against Screamer and upstream's VanillaJS, Solid and Halogen apps (`npm run bench:measure`; results in `bench/results/summary.md`). Absolute times depend on the machine, so compare frameworks within one run rather than against upstream's published tables. `bench/legacy/` holds earlier Screamer-only results from a cold-start harness that is not comparable.

## PSX integration

`screamer-psx` provides `Screamer.Psx` for `.psx` and `.psxt` sources.
The adapter depends only on Screamer and builds with the rest of the workspace.
Everything that needs PSX itself lives in `psx/`, a Spago workspace of its own
that takes Screamer's packages by path and pins PSX as build tooling: the
backend mapping (`psx/backends/mappings`), the PSX examples (`psx/examples`),
the paired native/PSX comparison apps (`psx/test/suite/apps`) and the tooling
package. Their canonical DOM contracts come from the pinned PSX checkout. The
root workspace never fetches PSX, so only the PSX workflow needs
`PSX_DEPS_TOKEN`.

```sh
npm run psx:build
npm run psx:generate
npm run psx:examples
npm run psx:suite -- --runs 1
```

`CHROME_PATH` selects the browser for smoke tests and the suite.
