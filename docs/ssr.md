# Server rendering and hydration

Rendering a Screamer `Element` to HTML on a server, and letting the client take that HTML over without rebuilding it. The tracking issue is #33; this document records its decisions (#34).

**Server rendering lives outside the core**, in a library such as the planned `screamer-ssr`, built on general seams that the core packages expose: context, `Host` and `Pending` (#48), the renderer backend and a low-level root API (#35), the router env (#36), and the property reflection table (#37). `suspense` (#50) is to add the boundary hook that streaming (#42) needs. Nothing in the core names the server, and nothing in the core imports the library. The renderer itself (the server tree, serialization, hydration, state transfer, mismatch recovery, event replay and streaming) is the library's work.

## Where the pieces live

| In the core (`screamer`, `screamer-reactive`, add-ons) | In the SSR library |
|---|---|
| Context, `Host`, `Pending`, `uniqueId` (#48) | Server node tree and server backend (#35, #37) |
| `Screamer.Renderer`: the `Backend` interface, `browserBackend`, `rendererKey`, `interactive`, `delegated`, `enter`/`leave` and `createAnchor` (#35) | `renderToString`, serialization, `stateScript`, `captureScript` (#37, #39, #41) |
| `Screamer.Element.Unsafe.instantiateWith` (#35) | Hydrating backend, `hydrate`, `hydrateWith` (#38, #40) |
| `Screamer.Html.Reflect`: property reflection table from codegen (#37) | `transfer`, `resourceT` (#39) |
| `foreignWithFallback_`; `on_` and `foreign_` honour `interactive` (#35) | `clientOnly`, an inert server `Host`, the server context keys and `withServerEnv` (#36) |
| `Screamer.Router`: `RouterEnv`, `routerKey`, `browserRouter`, `staticRouter` (#36) | `renderToStream` (#42) |

## Decisions

1. **How the server builds HTML: a pluggable backend.** The core routes every node operation through `Screamer.Renderer` (#35); the library supplies a server backend that builds a light node tree and serializes it. Rejected: a DOM shim (slow, shared global state), emitting strings directly (rewrites `dyn` and `each`; streaming builds on the backend instead), and a second interpretation of `Element` (reverses the decided final encoding).
2. **How the client takes over: hydrate in place**, through a hydrating backend with a cursor (#38). Islands stay open as a later addition. Rejected: replacing the server's nodes (loses focus and input) and resuming (handlers are closures).
3. **Effects on the server: settle, then snapshot.** Instantiate under a server root exactly as the client does, let the flush settle, wait for pending work, serialize, dispose.
4. **Async data: wait for the root's `Pending.settled`, with a timeout**, then render what is there. Streaming (#42) is later.
5. **How code knows it is on the server: context, not a platform value.** The server root provides an inert `Host`, a non-interactive backend, a static router env and the library's own context keys (request URL, redirect sink, hydration state). There is no `Platform` type and no `isServer` in the core, so server and client renders can coexist in one process.
6. **What state the client receives: re-run deterministic setup, transfer only async or nondeterministic values**, keyed by the core's `uniqueId` with an explicit key as override (#39). The codec is an explicit `{ encode, decode }` argument over `Json`; there is no dependency on `argonaut-codecs` or `yoga-json`.
7. **Mismatches: check cheaply everywhere** (tag names, node kinds, anchors, transfer keys) **and in full in development** (text, attribute values); patch text and attributes in place; on a structural mismatch discard the nearest `dyn`/`each` range or element and client-render it (#40).
8. **Marker format.** The server emits the anchors the client creates for `dyn` and `each` as `<!--[-->` and `<!--]-->`, plus an empty comment between adjacent text nodes and in place of an empty text node. Rows of `each` need no markers (#38).

## The seams

### The renderer backend (#35)

`Screamer.Renderer.Backend` is a JavaScript object with the node operations `Screamer.Element` performs; its TypeScript interface is in `packages/screamer/src/Screamer/Renderer.ts`. Nodes are opaque to the core, so a server backend can use plain objects. The operations are the DOM's (`createElement`, `createElementNS`, `createText`, `createComment`, `createFragment`, `appendChild`, `insertBefore`, `removeChild`, `parentNode`, `nextSibling`, `firstChild`, `lastChild`, `nodeType`, `clearChildren`, `setAttribute`, `removeAttribute`, `setProperty`, `setStyle`, `setText`, `listen`) plus:

- `interactive`: when false, `on_` attaches nothing and `foreign_` runs no setup. Add-ons that start listeners or observers check `Screamer.Renderer.interactive` first (`screamer-web` does).
- `enter(el)` and `leave(el)`, around building each element's children, also for an element with none. The browser backend does nothing; a hydrating backend moves its cursor into the element and then past it.
- `createAnchor(open)`, for the comments that open and close a range that changes: the anchors of `dyn` and `each`. The browser backend makes an empty comment; a server backend can mark it `[` or `]` (decision 8), and a hydrating backend can recognise ranges by it.
- `select(selector)`, for `mount`.

The backend is held in context under `rendererKey` (default `browserBackend`), not on `Scope`. `instantiate` looks it up once and the nodes built in that instantiation use it; `dyn` and `each` keep it for the ranges they build later, so the lookup is per instantiation, not per node. The browser backend reads `document` only when it makes a node, so the module loads in Node.

The browser backend owns the delegation registry: one `document` listener per delegated type (`Screamer.Renderer.delegated`), and the handlers stored on elements. `createBrowserBackend` makes a backend with its own registry. The browser backend's `dispatch(event)` runs the delegated handlers for an event as the document listener does, for replaying events captured before hydration (#41).

### Instantiating under another renderer (#35)

`Screamer.Element.Unsafe.instantiateWith backend setup el` creates a root scope, provides the backend, runs `setup` around the instantiation (to provide a `Host`, a router env or the library's own keys) and returns the root node and the action that disposes the root. It attaches nothing; `mount` is the same with `browserBackend`, followed by appending the node.

### Widgets with a fallback (#35)

`foreignWithFallback_ setup tag attrs fallback` renders `fallback` inside the host when the backend is not interactive, and does not run the setup. When it is interactive it clears whatever children the host has (a hydrating backend finds the server's fallback there) and runs the setup. `foreign_` is `foreignWithFallback_` with no fallback.

### Effects under a server root (#36)

| Effect | Under a server root | Through |
|---|---|---|
| `Router.location` | The provided `staticRouter url sink`; never reads `window` | `routerKey` |
| `Router.navigate` / `redirect` during render | Calls the static router's sink, where the library records the redirect | `routerKey` |
| `Router.link` | Renders `<a href>`, with no handler | `interactive` |
| `Time.clock`, `interval`, `after`, `frames`, `Resource.retry` | Whatever the provided host does; an inert host never fires | `Screamer.Host` |
| `Time.debounce`, `throttle`, `delay`, ... | Start timers only on occurrences, and the server fires none | `Screamer.Host` |
| `Resource.*` | Runs, registered with `Pending` so the renderer can wait | `Screamer.Pending` |
| `foreign_`, `on_` | No setup, no listener | `interactive` |

`Screamer.Router.RouterEnv` is a general seam: tests and an in-memory router use `staticRouter` or their own env too. `navigate` and `redirect` are `Owned`, reading the env; event handlers use the `push` and `replace` of the env that `Router.router` returns.

### Property reflection (#37)

`codegen/data.ts` lists every property the generated attributes set. `npm run codegen:dom` writes `packages/screamer/src/Screamer/Html/Reflect.g.ts`, the foreign module of `Screamer.Html.Reflect`, mapping each property to its HTML form: `value` to the `value` attribute, but to the text of a `<textarea>` and to `selected` on the matching `<option>` of a `<select>`; `checked`, `selected` and `muted` to boolean attributes; `contentEditable`, `draggable` and `spellcheck` to `"true"`/`"false"`; `translate` to `"yes"`/`"no"`; `className` to `class` and `htmlFor` to `for`. A property not in the table has no HTML form. CI checks that the generated file is current.

## What the library does

The issues #37 to #43 describe it; in short:

- A server tree implementing `Backend` with `interactive = false` and no `document` or `window`, serialized with the escaping rules of #37 and the reflection table.
- `renderToString { url, timeout } el`: `instantiateWith serverTree (withServerEnv ...) el`, wait for the root's `settled` or the timeout, serialize, dispose. `withServerEnv` provides an inert host, `staticRouter url sink` and the library's keys.
- `hydrate`: `instantiateWith` a hydrating backend that claims the server's nodes (using `enter`/`leave` and the anchors), then passes every later operation to `browserBackend`.
- `transfer` and `resourceT`, keyed by `uniqueId`; clock reads recorded and replayed through the `Host`.
- Mismatch detection and recovery inside the hydrating backend, and capture and replay of the `delegated` events through `browserBackend.dispatch`.
