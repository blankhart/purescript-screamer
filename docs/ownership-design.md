# Ownership redesign: replace sinuous with an owned reactive core

_Copied from the tracking issue #2 in stage 0. From here on this file is authoritative and #2 is kept in sync with it. Discrete events and the combinator library are specified in `docs/combinators.md` (#17); the API below uses the names decided there, so `Channel` appears only in the history of the stages._

Replace sinuous with a lazy reactive core that Screamer owns, and make `Signal` and `Element` pure values (Option B of the ownership redesign). The whole replacement lands as **one pull request** built in ten stages; each stage has its own sub-issue. Formlets follow in a second PR.

This issue is the specification. Stage 0 copies it into `docs/ownership-design.md` so it lives next to the code; after that, the file in the branch is authoritative and this issue is kept in sync with it.

## How agents work this plan

- **Branch:** `ownership-replacement`, created from `main` by the stage 0 agent. Every stage commits to this branch. Never force-push, rebase or amend pushed commits; other agents share the branch.
- **Pull request:** the stage 0 agent opens one **draft** PR from `ownership-replacement` to `main`, titled "Replace sinuous with an owned reactive core". Its description lists the ten stages as a checklist with `Closes #<stage issue>` for each. The stage 9 agent marks it ready for review.
- **Order:** run stages in numeric order. Stage 4 depends only on stage 1, but keep the order to avoid conflicts on a shared branch. One agent can take several consecutive stages.
- **Before starting a stage:** pull the branch, read `docs/ownership-design.md` and the stage issue, and confirm the previous stage is ticked in the PR description.
- **Commits:** prefix each with `stage N:`. Every commit must build (`npm run build`) and pass the tests (`npm test`) on its own. New modules go alongside old ones until stage 8 deletes the old ones, so the branch stays green throughout.
- **Finishing a stage:** push, wait for CI to pass on the branch, tick the stage in the PR description with its commit range, and comment on the stage issue with what was done and any deviation from the spec. Do not close stage issues; the PR closes them on merge.
- **Deviations:** if the spec is wrong or ambiguous, pick the option closest to the spec's intent, record it in a comment on this issue, and update `docs/ownership-design.md` in the same stage. If the change would alter a public PureScript type or a decision listed below as decided, stop and ask on this issue instead.
- **Out of scope:** a PSX preprocessor backend and server rendering. Do not build toward them.

## Why

On sinuous, a node's owner is whatever computation is running when its expression is evaluated. Screamer's combinators have pure types but allocate graph nodes, so lifetimes depend on evaluation order. This produces three reproduced failures: a derived signal that goes stale after its creator re-runs, observers that are never released (1000 leaked after 1000 creations), and a `merge` that stops listening. `mount` returns `Unit`, so nothing can unmount.

With a lazy core, a derived signal attaches to its sources only while observed. Allocating one has no effect on the graph, so it can be a pure value and can be garbage-collected. Only effects need an owner.

## Semantic model

Four kinds of signal node, plus the event nodes described in `docs/combinators.md`; only effects have owners.

| Node | Created by | Linked to sources | Owner | Lifetime |
|---|---|---|---|---|
| Cell | `signalSource` in `Effect` | is a source | none | GC when unreachable; holds observers only while they observe |
| Derived | `map`, `apply`, `bind`, `sampleOn`, `sampleManyWith`, `dropRepeatsBy` | only while observed | none | GC when unreachable; cached while observed, recomputed on demand otherwise |
| Stateful | `fold`, `merge`, `filter`, `filterOn` | only while observed | none | state lives in the node and advances only while observed |
| Effect | DOM bindings, `subscribe`, `hold`, `dyn` | always, while alive | a scope (required) | disposed with its scope; creating one outside a scope is an error |
| Event source | `eventSource` in `Effect` | is a source | none | GC when unreachable; an occurrence fired while unobserved goes nowhere |
| Derived event | `map`, `filter`, `<|>`, `changes`, `attachWith` (#18) | only while observed | none | produces only occurrences fired while observed |
| Stateful event | `take`, `zip`, `bufferCount` and the like (#19 to #23) | only while observed | none | state lives in the node; misses occurrences while paused |

### Stateful signals advance only while observed

- **Start.** State begins at the seed (for `merge`, the left input's current value). Values the input held before observation are not stepped over.
- **Step.** One step per propagation in which an input changed. Writes inside one batch coalesce, so two writes in one handler step a `fold` once.
- **Pause.** When the last observer goes, the node unlinks and keeps its state. `read` returns that state. When observed again it resynchronizes with its inputs without stepping, then continues.
- **Simultaneity.** When both inputs of `merge` change in one batch, the left wins (like Reflex's `leftmost`).

Guarantee: two evaluations of the same stateful expression produce the same values whenever they are observed over the same interval. Where a program needs one state regardless of who observes it, `hold :: Signal a -> Owned (Signal a)` observes the signal for the lifetime of the current scope and returns the same node.

### Glitch freedom and equality cutoff

Writes mark observed dependents dirty (push); reads recompute only nodes whose recorded dependency versions changed (pull). An effect runs at most once per batch and always sees a consistent graph. A derived node bumps its version only when its value changes under its equality (`Object.is` by default, PureScript `Eq` through `dropRepeats`), so unchanged results stop propagation. The exception is `merge`, which reports every step even when it repeats its value, so nested merges agree on which input changed and `<|>` stays associative.

### Where writes may happen

| Context | Writes allowed | When they take effect |
|---|---|---|
| Event handler (`on_`) | yes | the handler runs inside `batch`; effects flush once when it returns |
| `subscribe` callback, `component` setup | yes | queued into the next flush round; more than 100 rounds raises an "effect loop" error |
| Derived or stateful step function | no | a write throws (catches `unsafePerformEffect`) |

## PureScript API

```purescript
-- Screamer.Signal: everything here is pure
foreign import data Signal :: Type -> Type
instance Functor Signal; instance Apply Signal; instance Applicative Signal
instance Bind Signal; instance Monad Signal        -- dynamic dependencies
instance Alt Signal                                -- (<|>) = merge, left wins on ties
instance Semigroup a => Semigroup (Signal a)       -- lifted: append <$> a <*> b
instance Monoid a => Monoid (Signal a)             -- pure mempty

sampleOn       :: forall a b. Signal a -> Signal b -> Signal b
sampleMany     :: ...                              -- row-typed, unchanged
sampleManyWith :: ...                              -- row-typed, unchanged
dropRepeats    :: forall a. Eq a => Signal a -> Signal a
dropRepeatsBy  :: forall a. (a -> a -> Boolean) -> Signal a -> Signal a
fold     :: forall a b. (a -> b -> b) -> b -> Signal a -> Signal b
merge    :: forall a. Signal a -> Signal a -> Signal a
filter   :: forall a. (a -> Boolean) -> a -> Signal a -> Signal a
filterOn :: forall a. Signal Boolean -> a -> Signal a -> Signal a
read     :: forall a. Signal a -> Effect a           -- untracked, formerly get

-- Screamer.SignalSource: sources of signals (Screamer.Channel until #17)
type SignalSource a = { signal :: Signal a, put :: a -> Effect Unit, modify :: (a -> a) -> Effect Unit }
signalSource :: forall a. a -> Effect (SignalSource a)
batch        :: forall a. Effect a -> Effect a

-- Screamer.Event and Screamer.EventSource: discrete events (#18), specified in docs/combinators.md
type EventSource a = { event :: Event a, fire :: a -> Effect Unit }
eventSource :: forall a. Effect (EventSource a)

-- Screamer.Owned: effects with an owner
newtype Owned a = Owned (Scope -> Effect a)        -- Functor .. Monad, MonadEffect
onCleanup :: Effect Unit -> Owned Unit
subscribe :: forall a. Signal a -> (a -> Effect Unit) -> Owned Unit
hold      :: forall a. Signal a -> Owned (Signal a)
child     :: forall a. Owned a -> Owned { value :: a, dispose :: Effect Unit }
resource  :: forall a b. Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))   -- stage 9

-- Screamer.Core: elements
newtype Element = Element (Owned Node)             -- opaque; pure to construct
element_    :: String -> Array Attribute -> Array Element -> Element
svgElement_ :: String -> Array Attribute -> Array Element -> Element
fragment_   :: Array Element -> Element
text        :: Signal String -> Element
dyn         :: Signal Element -> Element           -- child scope per value
component   :: Owned Element -> Element            -- setup effects, once per instance
each        :: forall k a. Ord k => (a -> k) -> Signal (Array a) -> (Signal a -> Element) -> Element
on_         :: String -> (Event -> Effect Unit) -> Attribute    -- batched
mount       :: String -> Element -> Effect (Effect Unit)        -- returns unmount
instantiate :: Element -> Owned Node                             -- for tests and embedding
```

Removed: the `Signal (Effect a)` instances, `emit`, `_effectfulSignal`, `distinct` and `nonequal` (replaced by cutoff and `dropRepeats`), the `Semigroup`-as-`merge` instance (`merge` moves to `Alt`), `elements_` (renamed `each`, rows receive `Signal a`), `querySelector`, `querySelectorAll`, `Document`, and the "NOT REAL" scaffolding (`tutorial`, `tick`, `component`/`componentImpl` in `Core`, `trial`).

Evaluating an `Element` runs nothing, including the setup inside `component`. Instantiating runs everything once per instance under an owner that disposes it. Two mounts of the same `Element` are independent instances.

## Reactive core (TypeScript)

- **Versions.** Every node has a version that increases when its value changes. Derived and effect nodes record the version of each dependency they read.
- **Global epoch.** Bumped on every write. An unobserved derived node read twice in one epoch returns its cache.
- **Dirty marks.** A write marks observed dependents dirty and queues effects.
- **Link on first target, unlink on last.** Recursively; this is what makes allocation pure.
- **Dynamic dependencies.** After recomputing, an observed node unlinks dependencies it no longer read and links new ones.
- **Effect queue.** Effects run in creation order, re-check dependency versions first, and skip if nothing they read changed. Loop limit 100 rounds.
- **Scopes.** Cleanups run in reverse order; disposal is idempotent.
- **Dev checks** behind `__DEV__`: write guard, cycle detection among derived nodes, counters for live effects, scopes and links.
- **Exception safety.** A throwing derivation leaves its node dirty and the graph consistent; a throwing effect is reported to the nearest scope's error handler and does not stop the flush.
- **One runtime.** The core is the foreign module of `Screamer.Reactive.Core`. Other foreign modules import it at run time as `../Screamer.Reactive.Core/foreign.js` (where `purs` puts it in `output/`) and take its types from `./Reactive/Core.js`, so every module shares one graph and the import also works when Screamer is a dependency.
- **Release at batch end.** A node that loses its last target during a batch stays linked until the batch ends, and unlinks then only if nothing observes it again. A stateful node that moves from one observer to another within a batch therefore neither pauses nor resynchronizes.
- **`filterOn`.** Follows its source while the condition is true and holds its last value while it is false; when the condition becomes true it takes the source's current value. It starts at the source if the condition holds at the start, otherwise at the seed.
- **No owner inside computations.** Derivations and effect bodies run with no current scope, so they cannot create effects by accident. Code that builds a child scope from inside an effect (`dyn`, `each`) names the parent scope explicitly.
- **Libraries checked (stage 1).** `@preact/signals-core` 1.14.4 has `watched`/`unwatched` options on signals but keeps versions internal (`_version`); `alien-signals` 3.2.1 exposes an `unwatched` hook in `createReactiveSystem` but no first-observer hook and only per-link versions. Neither exposes both without patching, so the core is our own (`src/Screamer/Reactive/Core.ts`).

A working prototype (153 lines, 23 checks, randomized glitch test) is attached to the stage 1 issue, #4.

## DOM layer

| Concern | Approach |
|---|---|
| Creating nodes | `createElement` / `createElementNS` for SVG; static children appended once |
| Attributes | codegen records each name's kind (property, attribute, boolean attribute, style); constants set once; a `Signal` gets one owned effect calling the right setter |
| Text | one text node per signal child, updated through `nodeValue` |
| Events | `addEventListener` with the handler wrapped in `batch`; removal registered with `onCleanup` |
| `dyn` | a pair of comment anchors; each new value disposes the previous child scope, removes nodes between anchors, instantiates the new element in a fresh child scope |
| `each` | a row scope and row cell per key; kept keys update their cell; removed keys are disposed; moves use a longest-increasing-subsequence reconcile |
| `foreign_` | create the host element with its attributes and no children, then run the setup on it in the instance's scope, before the host is inserted; Screamer never touches its children (#27) |
| `mount` | root scope, instantiate into the mount point, return an action that disposes the scope and removes the nodes |

### Typed DOM

```purescript
class AttrValue v a | v -> a                         -- instances: a, and Signal a
href_     :: forall v. AttrValue v String  => v -> Attribute
disabled_ :: forall v. AttrValue v Boolean => v -> Attribute
tabIndex_ :: forall v. AttrValue v Int     => v -> Attribute
type_     :: forall v. AttrValue v InputType => v -> Attribute   -- generated ADT for enumerated values

style_ :: forall r. StyleRecord r => Record r -> Attribute
-- r checked against a generated row of CSS properties; each field String or Signal String

onClick_   :: (MouseEvent -> Effect Unit) -> Attribute       -- Web.UIEvent.MouseEvent
onKeyDown_ :: (KeyboardEvent -> Effect Unit) -> Attribute    -- Web.UIEvent.KeyboardEvent
onInput_   :: (Event -> Effect Unit) -> Attribute            -- Web.Event.Event
```

Handlers take the standard `Web.*` event types. Screamer's generated event classes, `eventCast` and `Event.g.purs` are deleted.

## Decisions

| Question | Decision |
|---|---|
| Migration path | **Decided:** one replacement PR in stages that each build and pass tests |
| Name of the effect monad | **Decided:** `Owned` (was `Build` in the design review) |
| Stateful node when unobserved | pause: keep state, stop stepping, resync on return |
| Stateful operators pure or in `Owned` | pure, with `hold` for explicit start times |
| `merge` tie-break | left |
| Write the core or wrap a library | write it, after checking alien-signals and `@preact/signals-core` for link hooks (stage 1) |
| Element encoding | final (`Owned Node`); no initial encoding |
| Default cutoff equality | `Object.is`; `dropRepeats` for `Eq` |
| Discrete events | **Decided (#17):** a separate `Event a` type with no current value and no cutoff; every occurrence propagates, in fire order. See `docs/combinators.md` |
| Names of sources | **Decided (#17):** `SignalSource` (`signalSource`, formerly `Channel`/`channel`) and `EventSource` (`eventSource`) |
| Combinators that need timers or async work | **Decided (#17):** they return `Owned`; everything else is pure |
| Escape hatch for JS widgets | **Decided (#27):** `foreign_ :: (Web.DOM.Element -> Owned Unit) -> String -> Array Attribute -> Element` in `Screamer.Core`, not a `withNode_` attribute. A host element with no Screamer children makes "Screamer never touches its children" true by construction, while an attribute could be put on an element that also has Screamer children, and attributes have no ordering to say when it runs. |

## Stages

Each is a sub-issue of this one. Stages 0 to 9 land on `ownership-replacement` in one PR; formlets are a separate PR afterwards.

- [ ] #3 Stage 0: benchmark baseline, test harness and CI
- [ ] #4 Stage 1: lazy reactive core in TypeScript
- [ ] #5 Stage 2: stateful nodes that advance only while observed
- [ ] #6 Stage 3: pure Signal and Channel API in PureScript
- [ ] #7 Stage 4: Owned monad and scopes
- [ ] #8 Stage 5: DOM layer without sinuous
- [ ] #9 Stage 6: codegen and typed DOM
- [ ] #10 Stage 7: port the examples and pass the benchmark gate
- [ ] #11 Stage 8: remove sinuous and rewrite the README
- [ ] #12 Stage 9: resources and subscriptions
- [ ] #13 Formlets (follow-up PR)

## Deviations

Recorded as they are made; each one is also commented on #2.

| Stage | Spec says | Done instead | Why |
|---|---|---|---|
| 0 | Branch `ownership-replacement` from `main` | Branch `claude/project-thread-3k9qtz` from `master` | The repository's default branch is `master`, and the session carrying the stages is restricted to its designated branch. One agent carries all stages, so a shared branch name is not needed for coordination. |
| 0 | `npm ci` in CI | The yarn lockfile is replaced by `package-lock.json` | `npm ci` requires an npm lockfile; keeping both lockfiles would let them drift. |
| 3 | Every node cuts off by `Object.is` | `merge` reports every step, with no cutoff | With cutoff, `(a <|> b) <|> c` and `a <|> (b <|> c)` disagree when `b` changes to the value the inner merge already shows while `c` changes in the same batch. The law tests compare traces with consecutive repeats removed. |
| 6 | Attribute functions named after the DOM property (`tabIndex_`) | The existing lowercase names (`tabindex_`), plus a `tabIndex_` alias | Keeps the generated names stable for existing code. |
| 6 | Enumerated types for attributes with a fixed token list | `autocomplete` stays a `String`; `maxlength` is an `Int` | `autocomplete` takes open-ended token lists. |
| 6 | An unknown style property fails with `NoInstanceFound` | It fails with `TypesDoNotUnify`, naming the property | The `CssProperties` row constraint is solved by unification. |
| 6 | Compile-fail fixtures under `test/` | They live in `compile-fail/` | `spago test` would otherwise compile them. |
| 7 | Handlers attached with `addEventListener` per element | Bubbling events (`click`, `input`, `keydown`, `mouseover`, …) are delegated to one document listener per type; others still get a listener per element | Event delegation was the first optimization the gate names. It removes two listeners per benchmark row from create and clear. Delegated handlers see the bound element as `currentTarget` and honour `stopPropagation`, but run after native listeners on ancestors, and a synthetic event must bubble to reach them. |
| 7 | Memory after clear within 10% of memory before create | After clear the JS heap is 14% above before create, the same ratio as sinuous (2.15/1.88 MB against 2.08/1.83 MB) | The difference is compiled code and type feedback: a heap snapshot after create and clear retains no rows, scopes, effects or cells, and repeated create and clear cycles plateau. |
| 7 | Every operation within 10% of the baseline | `remove` is 1% to 11% slower than sinuous in interleaved runs, and `select` is 0.2 ms slower on a 0.5 ms operation | Profiled: the JavaScript and the style and layout work are equal or smaller than sinuous for both, so the gap is in frame scheduling, below what the frame-timed measurement resolves. |
| 9 | `Timer.after` (type unspecified) | `after :: Milliseconds -> Effect Unit -> Owned Unit`, which runs the action once unless the scope is disposed first | It matches `AnimationFrame.every`, and a `Signal Boolean` that turns true once can be built from it with a channel. |
| 9 | A `Signal` of WebSocket messages | `message :: Signal (Maybe Message)` with `type Message = { index :: Int, data :: String }`; `send` queues while connecting and drops after close | The index makes two equal messages in a row two changes. Without it, the `Object.is` cutoff would merge them. |
| 9 | Router: a location signal and `navigate` | Adds `redirect` (replace the entry) and `link` (an anchor that navigates without reloading), and drops the old hash mode | `navigate` and `redirect` dispatch `popstate`, so every location signal updates the same way as on back and forward. |
| 9 | `resource` (module unspecified) | `Screamer.Resource`, with `Eq`, `Show` and `Functor` for `Remote` (`Failed` compares error messages) | The tests need `Eq` and `Show`. Started from inside an `Aff` fiber, a request's result arrives only after that fiber yields, because the Aff scheduler runs new fibers then. |
| 9 | No example file is empty | `examples/src/Formlets.purs` stays empty | Formlets are #13, outside this PR. |
| 13 | Branch `formlets` from `main` | Branch `claude/project-thread-abg7vj` from `master` | Same reasons as stage 0. |
| 13 | A form result of `Signal (Either String o)` | `Signal (Either (Array String) o)`, with `Apply` collecting the errors of every field | The issue allows a richer type, and a submit handler can then report every problem at once. |
| 13 | `Form props i o` built with `component` | A form is `Context props i -> Owned (Rendered o)`; `build` runs it in the caller's scope, which is usually a `component`'s | A wizard keeps its current step in a channel and disposes each step it leaves, so building a form needs a scope. Fields stay pure elements. |
| 13 | A number field | `number :: Form props String (Maybe Number)`: the state is the text as entered | Keeping the text lets a half-typed number survive, and lets `required` and `mustBe` validate the parsed value. |
| 13 | (not specified) | A property binding skips writes that would not change the property | Writing back the value an input just reported is a no-op, so the caret and a partial entry in a number input (whose `value` reads as `""`) are not reset. |
| #18 | `WebSocket.message` gains an `Event String` form | The socket record gains `messages :: Event String` next to the deprecated `message` signal | Adding a field keeps existing code compiling for the deprecation release. |
