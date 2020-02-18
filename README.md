# Screamer

## Sinuous

Efficient JS frameworks have a mechanism of tracing state changes to corresponding view changes, and then surgically mutating the affected sections of the DOM.

Virtual DOM frameworks generally use the updated state to construct a parallel representation of the DOM (which is not displayed to the user) diff the parallel representation against the prior parallel representation, and use the differences to identify "patches" that must be made to the actual DOM.

[Sinuous](https://github.com/luwes/sinuous) is a static DOM framework which requires state to be registered as an "observable," tracks references to the state in the rendering function, and computes the patch directly from those references and the updated state.

See discussion of the difference between the `vdom` and the `sdom` at [this blog post](https://blog.functorial.com/posts/2018-03-12-You-Might-Not-Need-The-Virtual-DOM.html).  The differences are operationalized through [`purescript-halogen-vdom`](https://github.com/purescript-halogen/purescript-halogen-vdom) and [`purescript-sdom`](https://github.com/paf31/purescript-sdom).

## Code Generation

Ideally the DOM elements, attributes, and events would be generated from a Web IDL specification similar to the way TypeScript definitions are generated [here](https://github.com/microsoft/TSJS-lib-generator/blob/master/inputfiles/browser.webidl.preprocessed.json) and with a corresponding structure.  The benefit of having a typeclass-based representation is to increase type safety in accessing particular attributes without unsafe casts.
