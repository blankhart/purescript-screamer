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

export function tick(counter: Observable<number>) {
  return function () {
    setInterval(() => counter(counter() + 1), 100);
  };
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
