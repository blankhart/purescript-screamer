import { h } from 'sinuous';
import { computed, observable, Observable } from 'sinuous/observable';

// NOTE: Unclear how to integrate 'cleanup'
// import S from 's-js';
// import { context } from 'sinuous';
/*
const h = context({
  subscribe: S,
  cleanup: S.cleanup,
  root: S.root,
  sample: S.sample,
});

Is there a way to merge observables without requiring manual imperative cleanup?  The intended semantics are:

```typescript
const merge = <S>(a: Observable<S>) => (b: Observable<S>) => {
  const o = observable(sample(a));
  const unsubscribe_a = subscribe(() => o(a()));
  const unsubscribe_b = subscribe(() => o(b()));
  return o;  // goodbye unsubscribe_a and _b
}
```

There doesn't seem to be a way to do this through a `computed`.

The problem with failing to unsubscribe is that the downstream observable would continue to update even after a parent computed has been disposed of (or is no longer firing).  This would arise when a grandchild computed subscribes to a grandparent computed and the parent goes out of scope.  The solution is to ensure that the parent computed's cleanup function calls unsubscribe methods attached to all of its children.

The alternative would be to ensure that each observable has a list of unsubscribe functions, and that the cleanup function for any component runs all of the unsubscribe functions of its child observables.  To wrap and hide the imperative state, this would require all of the observable creation to occur in a monad.

*/

export const documentImpl: Document = document;

export const querySelectorImpl = (document: Document) => {
  return (selector: string) => {
    return () => {
      return document.querySelector(selector);
    };
  };
}

export const querySelectorAll = (document: Document) => {
  return (selector: string) => {
    return () => {
      return [].slice.call(document.querySelectorAll(selector));
    };
  };
};

type Attribute = { key: string, value: any };

export const attribute = (key: string) => {
  return (value: any) => {
    return { key, value };
  };
};

// intended to work for HTML only
// more efficient not to construct objects each time
export const element = (tag: string) => {
  return (attributes: Attribute[]) => {
    return (children: HTMLElement[]) => {
      const attrs: Record<string, any> = {};
      for (let { key, value } of attributes) {
        console.log(`key, value: ${key}, ${value}`);
        attrs[key] = value;
      }
      return h(tag, attrs, children);
    };
  };
};

export function handler(name: string) {
  return function (onEvent: (e: Event) => (() => void)) {
    return { key: "on" + name, value: (e: Event) => onEvent(e)() };
  };
};

export const mount = (selector: string) => (component: () => Element) => () => {
  const element = document.querySelector(selector);
  if (element) {
    element.appendChild(component());
  } else {
    console.error(
      `unable to mount at selector "${selector}" because the document has no matching element`
    );
  }
}

// FAKERY

export const tick = (counter: Observable<number>) => () => {
  setInterval(() => counter(1), 100);
};

export const tutorial = () => {
  const counter = observable(0);
  const view = () => {
    const mkCounter = (c: Observable<number>) => h('div', {}, c);
    return h(
      'div',
      { style: 'color: blue', onclick: () => counter(0) },
      [counter
        , computed(() => counter() + 1)
        , computed(() => counter() + 2)
      ].map(mkCounter));
  };

  document.body.append(view());
  setInterval(() => counter(counter() + 1), 100);
}
