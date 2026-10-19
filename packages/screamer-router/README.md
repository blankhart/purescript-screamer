# screamer-router

The browser location as a signal.

| Module | What it has |
|---|---|
| `Screamer.Router` (was `Screamer.Subscriptions.Router`) | `Location`, `location`, `navigate`, `redirect`, `link`; the router env: `RouterEnv`, `browserRouter`, `staticRouter`, `routerKey`, `withRouter`, `router` |
| `Screamer.Router.Windrose` | `matchHash`, `matchPath`: route a location with [windrose-router](https://github.com/blankhart/purescript-windrose-router), whose routes are a type |

`location`, `navigate`, `redirect` and `link` read the router env from context (default `browserRouter`, the History API). Provide `staticRouter url sink` for a fixed location, as a server renderer or a test does: navigation then calls the sink. `navigate` and `redirect` are `Owned`; an event handler uses the `push` or `replace` of the env that `router` returns.

Depends on: screamer, windrose-router. See `examples/src/Router.purs`.
