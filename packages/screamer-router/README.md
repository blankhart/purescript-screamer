# screamer-router

The browser location as a signal.

| Module | What it has |
|---|---|
| `Screamer.Router` (was `Screamer.Subscriptions.Router`) | `Location`, `location`, `navigate`, `redirect`, `link`; the router env: `RouterEnv`, `browserRouter`, `staticRouter`, `RouterKey`, `routerKey`, `withRouter`, `router` |
| `Screamer.Router.Windrose` | `matchHash`, `matchPath`: route a location with [windrose-router](https://github.com/blankhart/purescript-windrose-router), whose routes are a type |

`location`, `navigate`, `redirect` and `link` read the router env from context (default `browserRouter`, the History API). Provide `staticRouter url sink` for a fixed location, as a server renderer or a test does: navigation then calls the sink. `navigate` and `redirect` are `Owned`; an event handler uses the `push` or `replace` of the env that `router` returns.

Depends on: screamer, windrose-router. See `examples/src/Router.purs`.

### History routing

`matchPath` passes `pathname <> search` to Windrose, so routes with `Q` receive
their query parameters. It excludes the hash. A failed match returns `Left`
with the path and query; render your not-found view there. `matchHash` instead
matches everything after `#`, including a query stored inside the hash.

`examples/src/HistoryRouter.purs` uses the default `browserRouter`, typed `Q`
parameters, `link`, and a not-found page. Run `npm run build:examples`, then
`npm run serve`, and open <http://localhost:8080/history-router/>. Try Sign in,
back/forward, and reloading the query-bearing URL. `link` navigates through the
router without reloading; ordinary anchors retain browser navigation unless
you opt into interception.

### Ordinary anchors

Call `interceptLinks { exclude: [ "/auth/", "/api/" ] }` once inside the root
`component` to route plain `<a href>` clicks through the current `RouterEnv.push`.
This works with markup-first views and with a provided `staticRouter` in tests.
The window click listener is removed with its scope and is not installed on a
non-interactive renderer. Exclusions are literal pathname prefixes.

Modified clicks, non-primary clicks, already-prevented events, download links,
external origins, non-HTTP URLs, non-self targets (including a default `<base
target>`), and hash-only links keep browser behavior. Nested anchor content is
supported. `Router.link` also works alongside interception without navigating
twice. Navigation is batched.

On a production server, serve existing assets and API/auth endpoints first,
then serve the application HTML shell for every application path (including
unknown paths). The client renders the not-found page. Do not send HTML for
missing API or asset requests. Use absolute asset URLs in the shell so nested
routes reload correctly. The example server uses this fallback specifically
under `/history-router/`.
