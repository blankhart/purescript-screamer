# Screamer Contributor Guide

Screamer is a PureScript library for building DOM interfaces without a virtual DOM. Its public API is PureScript; TypeScript implements the reactive runtime and foreign bindings. Favor precise types, explicit ownership, and small APIs whose behavior remains predictable under composition.

## Project structure

This is one Spago workspace containing packages released together at one version. Keep existing package boundaries meaningful; a new module does not by itself require a new package.

- `packages/screamer-reactive`: signals, events, sources, scopes, context, host, pending work, and the runtime. This package must build without DOM globals or `web-*` dependencies.
- `packages/screamer`: elements, attributes, HTML, SVG, and DOM rendering.
- `packages/screamer-combinators`: additional signal and event operators, time, and owned flattening.
- `packages/screamer-resource`: cancellable requests represented as signals.
- `packages/screamer-web`: browser subscriptions such as WebSocket connections.
- `packages/screamer-router`: location tracking and the Windrose adapter.
- `packages/screamer-forms`: formlets and validation.
- `packages/screamer-motion`: transitions, animation, and animated values.
- `packages/screamer-devtools`: runtime inspection, recording, diagnostics, and work budgets.
- `packages/screamer-test`: observation helpers, DOM helpers, and fake clocks.
- `packages/screamer-psx`: PSX adapter, generated API, and conformance tests. PSX is build tooling under `tooling/psx`.
- `examples/psx`: PSX examples; `test/suite/apps` contains paired native/PSX scenarios. Run `npm run psx:generate`, `npm run psx:examples`, and `npm run psx:suite` after PSX integration changes.
- `examples/src`: runnable examples and integration demonstrations.
- `codegen`: DOM metadata, generators, and templates.
- `compile-fail`: fixtures checking the public API's type constraints.
- `bench`: framework benchmarks; `bench/legacy` contains a different, noncomparable harness.
- `scripts`: package checks, test orchestration, and release tooling.

Sources and tests normally live in each package's `src/` and `test/` directories. Read the relevant package README before changing its API. Update this file alongside changes to paths, commands, architecture, or contributor expectations.

## PureScript and TypeScript boundaries

Use PureScript for public contracts, typed composition, validation, and policies that fit the existing PureScript layer. Prefer ADTs to string protocols and opaque foreign types for runtime or browser handles. Translate into foreign representations at a narrow boundary.

The TypeScript runtime is an intentional implementation layer, not merely browser glue. Preserve its graph, scheduling, and scope responsibilities. Do not move it into PureScript as incidental cleanup, or move typed library policy into TypeScript merely for convenience. Keep add-ons on the established runtime interface rather than reaching into unrelated internals.

Production FFI is authored in `.ts`. `tsc` emits adjacent `.js` files before Spago compiles the PureScript modules. Edit the TypeScript source, not the emitted JavaScript. Existing handwritten test and example JavaScript is a separate convention and may be edited directly.

Use explicit failure types where callers can recover or distinguish errors. Avoid hiding invalid inputs behind fabricated successful values. Model resource phases with constructors that carry the data valid for that phase rather than loosely related flags.

## Reactive semantics and ownership

Treat these as API invariants, not implementation details:

- Pure signal composition constructs values without allocating owned state or eagerly connecting a graph. Derived signals connect while observed. Sharing or inlining a signal must not change its meaning.
- A source signal updates when written a different value. A derived signal updates when an argument updates, even if its computed value repeats. Deduplication is explicit through stateful operators such as `dropRepeats`.
- Operators that remember history create state in `Owned`. Their state starts when the owned action runs and advances throughout the owning scope's lifetime, independently of observation.
- Preserve the distinction between the current timestep, T0, and the next timestep, T1. Reads and writes must agree with their names. Writes within the outermost `batch` are delivered together when it returns.
- Events preserve every occurrence, including repeated values and multiple occurrences in one batch, in fire order. Do not introduce signal-style deduplication or coalescing into event delivery.
- Effects, subscriptions, stateful nodes, and dynamic children have owners. Scope disposal releases children newest first, then runs the scope's own cleanups in reverse order.
- Runtime changes must preserve consistent propagation, reentrant behavior, and diagnostics. Use the runtime tests to establish behavior before changing scheduling or graph maintenance.

Keep `screamer-reactive` usable in plain Node. Browser integration belongs in the appropriate DOM or web package.

## Elements and resource lifetimes

Use `component` when setup needs an instance lifetime. Its `Owned Element` action runs once for each instance; allocate instance state and subscriptions there. Use ordinary element constructors for reusable presentation that needs no setup.

Tie timers, listeners, sockets, animations, requests, and other resources to their scope. Register cleanup where a resource is acquired. Removing a dynamic branch or list row, or invoking the cleanup returned by `mount`, must release the resources it owns.

Represent asynchronous requests with cancellable `Aff` where appropriate. An obsolete or disposed request must not publish a result. Prefer existing resource, scope, and cancellation mechanisms to a parallel lifecycle protocol.

Use `foreign_` for widgets that own their DOM subtree and `foreignWithFallback_` when fallback content is needed. Initialize against the host, destroy through `onCleanup`, and guard two-way synchronization against feedback. Batch callbacks coming from outside Screamer.

Keep enter, move, and leave behavior on the established element hooks. Leave completion and cancellation must clean up their scope. Motion should honor reduced-motion preferences and use explicit durations.

## PureScript style

Follow the idioms used in Nathan Faubion's libraries and the surrounding code:

- Use `case _ of` for small eliminators and handlers. Define a sum-type eliminator once rather than repeating its name across equations; direct record or newtype destructuring is fine.
- Favor pattern matching and guards over deeply nested conditionals.
- Use `do` with local `let` bindings rather than `let ... in ...`, including in pure functions.
- Give functions explicit signatures and modules explicit export lists.
- Keep records focused; name domain concepts and distinguish easily confused values with newtypes.
- Qualify imports where that clarifies provenance, especially event and signal operations.
- Use composition when it clarifies the flow; avoid point-free expressions that obscure it.
- Explain invariants and surprising constraints in comments rather than narrating the implementation.
- Run `npm run format` for PureScript formatting. Use the existing purs-tidy setup rather than introducing another formatter.

Extract code when it forms an independently useful API, policy, or testable unit. Keep related implementation together when splitting it would only scatter a module's internal details.

## Generated DOM API

The typed HTML, attribute, handler, SVG, and reflection modules are generated from `codegen/data.ts` and templates under `codegen/templates`. Change the generator inputs and run:

```sh
npm run codegen:dom
```

Commit the resulting generated `.g.purs` and `.g.ts` sources with the input changes. Do not hand-edit generated output. Preserve typed event payloads, enumerated attribute types, and checked style properties. Extend compile-fail fixtures when a change affects what the API accepts or rejects.

## Testing

During iteration, run the narrowest relevant suite. For normal implementation changes, finish with:

```sh
npm run build
npm test
node scripts/check-packages.mjs
```

`npm test` includes the TypeScript runtime tests, package PureScript tests, and compile-fail fixtures. The individual scripts are `test:core`, `test:purs`, and `test:compile-fail`; the last expects an existing build. `test:purs` installs jsdom before loading DOM tests and also runs the designated server test without DOM globals.

Add behavioral regression coverage where semantics change: propagation and batching, event ordering, observation-independent state, dynamic children, scope cleanup, cancellation, and error handling. Prefer the existing fake host and clocks to real-time delays. Use `Screamer.Test.runSpec` so unexpected runtime warnings fail tests; restrict `withoutStrict` to cases intentionally checking warnings.

For DOM or example changes, also run:

```sh
npm run build:examples
npm run test:smoke
```

Smoke tests require Playwright Chromium. Use `npm run serve` for browser checks, and `npm run inspect -- <Example> [script.mjs]` for headless scope and runtime inspection. Report which browser behavior was actually checked; compilation and jsdom alone do not establish animation, layout, or browser API behavior.

For runtime or DOM performance changes, use `npm run bench:measure` when measurements are needed. Compare frameworks within the same run; do not compare absolute times with upstream tables or legacy results. Use devtools leak and work-budget assertions when they directly test the changed behavior.

Documentation-only changes need a review of their commands and claims, not a full implementation test run. Consult `.github/workflows/ci.yml` for the complete CI checks, including generated-source freshness and benchmark bundling.

## Repository hygiene and refactoring

Use the local npm scripts and lockfiles. Preserve user changes already present in the worktree. Keep refactoring separate from unrelated behavior changes and proceed in stages that build and can be reviewed. Add characterization tests before replacing subtle runtime behavior. Remove temporary compatibility code once its callers migrate.

Do not edit or commit build output in `output/`, `output-es/`, `examples/output/`, or dependency/cache directories. Compiled `packages/*/src/**/*.js` files are committed only on the `release` branch by release tooling; keep them out of development commits. Generated DOM sources are the intentional exception described above.

All packages share a version. Use `npm run set-version -- <version>` for version changes. `npm run release -- <version>` builds, tests, and creates the release tree and tag; `--push` publishes them. Follow the README and release workflow when a release is requested, and do not release as part of ordinary implementation work.
