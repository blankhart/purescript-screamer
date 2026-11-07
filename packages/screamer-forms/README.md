# screamer-forms

Formlets: forms that compose like applicative values, the way Lumi Components' `FormBuilder` does.

| Module | What it has |
|---|---|
| `Screamer.Form` (was `Screamer.Examples.Formlet` in `examples/`) | `Form props i o`, `build`, `prop`, `indent`, `section`, `validated` with `Validator`s, the fields `textbox`, `password`, `number`, `checkbox`, `select`, and `wizard` with `step` |

A form's `Context` holds its part of the state as a `SignalSource`, focused from the whole with `Screamer.Source.focus` and `prop`.

Depends on: screamer. See `examples/src/Formlets.purs`.
