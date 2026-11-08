# screamer-psx

PSX syntax for Screamer. Import `Screamer.Psx` in `.psx` or `.psxt` files. The adapter has no PSX runtime dependency.

From the repository root, run `npm run psx:build`, `npm run psx:generate`, `npm run psx:examples`, and `npm run psx:suite`. PSX is pinned as build tooling in `psx/spago.yaml`, a separate workspace, and the generator's mapping is `psx/backends/mappings/screamer.json`.

`onsubmit={save}` prevents the browser's default form submission before running
`save`. It still bubbles. For a form that should submit normally, use a trait
hole with `Screamer.Html.Handlers.onSubmit_`:

```html
<form {H.onSubmit_ \_ -> save}>...</form>
```

`onclick={effect}` does **not** prevent the default action; an anchor still
navigates. To intercept navigation, use a trait hole with `H.onClick_` and call
`Web.Event.Event.preventDefault` on `Web.UIEvent.MouseEvent.toEvent e` before
running the effect.
