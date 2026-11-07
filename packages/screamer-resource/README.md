# screamer-resource

Asynchronous values that follow a signal or an event.

| Module | What it has |
|---|---|
| `Screamer.Resource` | `Remote`, `resource`, `resourceWith`, `request` under a `Strategy` (`Switch`, `Merge`, `Concat`, `Exhaust`), `retry` with a `RetryPolicy`, `keepLast`, `withDefault`, `toMaybe`, `isLoading` |

Each running request is registered with `Screamer.Pending`, and `retry` waits on the scope's `Screamer.Host`. Depends on: screamer-reactive, aff.
