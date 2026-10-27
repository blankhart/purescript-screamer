# screamer-motion

Enter, leave and move animations for `dyn` branches and `each` rows, crossfades between lists, animated values and view transitions. It is built on the core's `withEnter`, `withMove` and `withLeave` hooks and its public API, the way any add-on would be.

| Module | What it has |
|---|---|
| `Screamer.Motion` | everything below, re-exported |
| `Screamer.Motion.Transition` | `transition`, `Phase`, `TransitionOptions`, `fade`, `slide`, `Axis`, `withoutTransitions`: CSS classes and inline-style presets |
| `Screamer.Motion.Animate` | `animate`, `leaveWith`, `keyframe`, `Keyframe`, `AnimationOptions`, `flipMoves`, `crossfade`, `Crossfade`, `CrossfadeOptions`: the Web Animations API |
| `Screamer.Motion.Value` | `tween`, `spring`, `tweened`, `sprung`, `Animated`, `Interpolate`, `defaultSpring`, `linear`, `quadOut`, `cubicOut`, `cubicInOut` |
| `Screamer.Motion.ViewTransition` | `viewTransition`, `viewTransitionHere` |
| `Screamer.Motion.ReducedMotion` | `withReducedMotion`, `reducedMotionNow`, `reducedMotion`, `ReducedMotionKey` |

Depends on: screamer, screamer-combinators (`Screamer.Time.frameLoop`) and screamer-web (`Screamer.Web.MediaQuery`).

## Transitions

A transition wraps an element, and animates the branches and rows of every `dyn` and `each` inside it. Hooks see each top-level element of a branch or row, so a branch that should animate as one goes in a single element.

```purescript
transition
  { enter: { from: "fade-from", active: "fade-active", to: "" }
  , leave: { from: "", active: "fade-active", to: "fade-to" }
  , move: "list-move"
  , duration: Milliseconds 200.0
  , appear: false
  }
  (E.ul_ [] [ each _.id items row ])
```

```css
.fade-active { transition: opacity var(--screamer-duration) ease; }
.fade-from, .fade-to { opacity: 0; }
.list-move { transition: transform var(--screamer-duration) ease; }
```

On enter, `from` and `active` are added; once the node has been painted with them (two frames), `from` is swapped for `to`; at the end `active` and `to` are removed. Leave does the same and then detaches the node. A moved row is put back where it was with an inline transform, then slides to its place with the `move` class; the empty string leaves moves to an enclosing `flipMoves`. The node has `--screamer-duration` while it transitions, so the duration is written once.

Durations are never read from computed styles. A transition ends at the first of its node's own `transitionend` or `animationend` and a timer at the stated duration, so a hook always finishes even when no event fires.

- `fade duration` and `slide { axis, duration }` need no stylesheet: they write their own inline `transition`, `opacity` and `transform` while they run.
- Enter hooks run only for branches and rows a change adds, never for a `dyn`'s or `each`'s initial build, so a list does not animate every row when its parent appears; `appear: true` opts the initial build in. Hydrated nodes never enter.
- When `each` rebuilds a key whose old row is still leaving, the old nodes are removed first and the new row enters.
- Hooks are inherited by every `dyn` and `each` inside the element. `withoutTransitions` resets them for a subtree.

## Web Animations

```purescript
animate    :: Array Keyframe -> AnimationOptions -> Node -> Owned Unit   -- an EnterHook
leaveWith  :: Array Keyframe -> AnimationOptions -> LeaveHook
flipMoves  :: AnimationOptions -> Element -> Element
crossfade  :: forall k. Ord k => CrossfadeOptions -> (Crossfade k -> Element) -> Element
```

`withEnter { appear: false } (animate [ keyframe { opacity: "0" }, keyframe { opacity: "1" } ] opts)` fades rows in; `withLeave (leaveWith frames opts)` animates them out and detaches each when `animation.finished` resolves, so no timeout is needed. An animation belongs to the scope it starts in and is cancelled when that scope is disposed.

`flipMoves` animates `each` reorders: a row that moves, or is displaced by rows added or removed around it, slides from where it was (Svelte's `animate:flip`). A move that interrupts another starts from where the row is shown.

`crossfade` carries rows between lists (Svelte's `crossfade`). It wraps the region that holds the lists and gives the body `send` and `receive`, which mark rows with a key:

```purescript
crossfade opts \{ send, receive } -> E.div_ []
  [ E.ul_ [] [ each _.id todo \t -> send (_.id <$> t) $ receive (_.id <$> t) (item t) ]
  , E.ul_ [] [ each _.id done \t -> send (_.id <$> t) $ receive (_.id <$> t) (item t) ]
  ]
```

When a row with some key leaves and one with the same key enters in the same round, the new row grows from the old one's place while the old one moves toward it. A row with no counterpart fades. Unmarked rows in the region leave and enter without animation.

## Animated values

```purescript
tween  :: forall a. Interpolate a => { duration :: Milliseconds, easing :: Number -> Number } -> Signal a -> Owned (Signal a)
spring :: forall a. Interpolate a => { stiffness :: Number, damping :: Number, precision :: Number } -> Signal a -> Owned (Signal a)
```

Each follows its target signal, easing to every new value from the value shown. They run on `Screamer.Time.frameLoop`, which requests frames only while the value is moving, so a settled value costs nothing. `tweened` and `sprung` take a starting value instead and return `{ signal, set, jump }`, where `jump` moves at once without animating. A spring's distance and speed are fractions of the way from where its move started, since `Interpolate` gives no distance; a new target starts from the value shown, at rest. `Interpolate` has instances for `Number`, `Int` and arrays of either.

## View transitions

`viewTransition update` runs `update` (its writes in one `batch`) inside `document.startViewTransition`, which crossfades snapshots of the page before and after, as for a route change. Where the API is missing or motion is reduced it is a plain `batch`. `viewTransitionHere` is the same as the current scope sees it, honouring `withReducedMotion`.

## Reduced motion

Everything honours `(prefers-reduced-motion: reduce)` by default, and `withReducedMotion true` or `false` overrides it for a subtree. When motion is reduced, or the renderer is not interactive, nothing animates: enter hooks leave the node in its final state, leave hooks detach it in the same round, `tween` and `spring` jump, and `viewTransition` is a plain `batch`. Since nothing waits for the browser's end events then, an app's own `onTransitionEnd_` and `onAnimationEnd_` handlers do not fire.

## Testing

Every step is timed through the scope's `Screamer.Host`, so a `fakeHost` from screamer-test drives transitions, crossfades and animated values with `advance`, and `scheduled` returns 0 once they settle. Under jsdom, which has no `Element.animate`, Web Animations finish at once.
