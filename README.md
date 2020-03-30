# Screamer

Everything involving a `Signal a` is effectful.

* Running a signal is effectful because it involves a time-varying quantity.

* Creating a `computed` is morally pure, but actually effectful because `sinuous` modifies the signal graph under the hood.  Any effects referenced in the signal body will be run on creation, but if they are themselves thunked, that run will remain pure apart from modifications of the signal graph (an FFI call).  Differentiation is necessary between `Signal a` and `Signal (Effect a)`.  Ignoring the underlying mutation is an acceptable abstraction similar to the one in `purescript-signal`, which mutated variables under the hood.

As a result, the return value of a component must be thunked, or a signal in order for the value to be deferred.  Creating that signal will result in the execution of any underlying effects.  This will require extreme care in order to maintain basic guarantees.

The accumulation of unsubscribe functions is effectful, but not necessarily monadic because the cleanups can occur in any order.  Thus, an applicative instance should suffice.

We distinguish between a `Channel` and a `Signal`.  When determining whether an action is represented as effectful through the type system, effects that only modify the `sinuous` observable graph are ignored, but all other effects are represented.

A `Channel` can be created in pure fashion because it only modifies the signal graph.  A `Channel` can be reset only through an effectful function.  A `Channel` is never disposed of, other than via disposal of the parent computation.

A `Signal` can be created in a pure fashion from a `Channel`.  A `Signal` ordinarily can be created in a pure function from another `Signal`, with exceptions.

First, merging `Signal`s requires imperative management of the signal graph, and therefore is effectful to the extent that this management will be taken care of within a monad (but not otherwise).  For example, the framework could return an effect so that the operation has type `merge :: Signal a -> Signal a -> { result :: Signal a, cleanup :: Effect Unit }`.

Second, if a `Signal` represents a quantity that depends on side effects (for example, a web socket) its creation will be effectful.  If the side effecting value is thunked, the operation will remain pure because the side effects will not be run.  In a typical case, though, the caller creating the observable will want the socket created, so this runs in effect.

The `Signal` type can accumulate its own cleanup functions.  If the `Signal` is effectful beyond modification of the graph, creation of the signal via `computed` should have type `Effect (Signal a)`.  Running the signal will then also involve an effect and have type `Signal a -> Effect a`.

This is going someplace where there is a `Component` type that everything runs in, and functions `render :: ComponentT Effect -> ComponentT Effect` and `mount :: Component -> Effect Unit`.  But any rendering to a particular `Element` has to run an effect rather than keeping it thunked in order to maintain a sane API.

`Element` (and `Attribute`) then would be opaque types that embed effects, or really, ?.

## Sinuous

Efficient JS frameworks have a mechanism of tracing state changes to corresponding view changes, and then surgically mutating the affected sections of the DOM.

Virtual DOM frameworks generally use the updated state to construct a parallel representation of the DOM (which is not displayed to the user) diff the parallel representation against the prior parallel representation, and use the differences to identify "patches" that must be made to the actual DOM.

[Sinuous](https://github.com/luwes/sinuous) is a static DOM framework which requires state to be registered as an "observable," tracks references to the state in the rendering function, and computes the patch directly from those references and the updated state.

See discussion of the difference between the `vdom` and the `sdom` at [this blog post](https://blog.functorial.com/posts/2018-03-12-You-Might-Not-Need-The-Virtual-DOM.html).  The differences are operationalized through [`purescript-halogen-vdom`](https://github.com/purescript-halogen/purescript-halogen-vdom) and [`purescript-sdom`](https://github.com/paf31/purescript-sdom).

## Code Generation

Ideally the DOM elements, attributes, and events would be generated from a Web IDL specification similar to the way TypeScript definitions are generated [here](https://github.com/microsoft/TSJS-lib-generator/blob/master/inputfiles/browser.webidl.preprocessed.json) and with a corresponding structure.  The benefit of having a typeclass-based representation is to increase type safety in accessing particular attributes without unsafe casts.

## Alternative Designs

The event handlers could be limited to changing primitive state variables (form content, mouse position, etc.) and the remainder of the component would consist of subscriptions to those state variables and handlers using Sinuous's `subscribe()` and external listeners through a uniform interface.

## References

### Component-Local State

* [purescript-hertz]()
* [purescript-halogen]()
* [purescript-react-basic]()

### Elm-Likes

* [purescript-hedwig]()
* [miso]()

### Reactivity

Sinuous allows plugging alternative reactive JS libraries ([wiki](https://github.com/luwes/sinuous/wiki/Choose-your-own-reactive-library)).

* [purescript-flare](https://github.com/sharkdp/purescript-flare) ([tutorial](https://david-peter.de/articles/flare/))
* [purescript-signal]() and [purescript-signal-loop](https://github.com/paf31/purescript-signal-loop/blob/master/src/Signal/Loop.purs)
* [reflex-dom]()
* [reactive-banana]()
* [hyperactiv]()
* [sinuous/observable]()
* [S.js]()

### Markup

* [purescript-smolder](https://github.com/bodil/purescript-smolder) and [purescript-smolder-dom](https://pursuit.purescript.org/packages/purescript-smolder-dom)
