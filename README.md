# Screamer

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
