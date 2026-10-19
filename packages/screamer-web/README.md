# screamer-web

Browser subscriptions, owned by a scope.

| Module | What it has |
|---|---|
| `Screamer.Web.WebSocket` (was `Screamer.Subscriptions.WebSocket`) | `connect :: String -> Owned Socket`, with `state`, `messages` and `send`; it closes when its scope is disposed |

Depends on: screamer-reactive.
