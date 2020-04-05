import { h, hs } from 'sinuous';
import { computed, observable, sample, subscribe, Observable } from 'sinuous/observable';
import { map } from 'sinuous/map/mini';

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

type ScreamerAttribute = { key: string, value: () => any };

type ScreamerElement = () => Element;

// intended to work for HTML only
export const element_ = (tag: string) => (attributes: ScreamerAttribute[]) => (children: ScreamerElement[]) => () => {
  const sinuousAttrs: Record<string, any> = {};
  for (let { key, value } of attributes) {
    // console.log(`key, value: ${key}, ${value}`);
    sinuousAttrs[key] = value();
  }
  const sinuousChildren: Element[] = children.map(e => e());
  return h(tag, sinuousAttrs, sinuousChildren);
};

export const svgElement_ = (tag: string) => (attributes: ScreamerAttribute[]) => (children: ScreamerElement[]) => () => {
  const sinuousAttrs: Record<string, any> = {};
  for (let { key, value } of attributes) {
    // console.log(`key, value: ${key}, ${value}`);
    sinuousAttrs[key] = value();
  }
  const sinuousChildren: Element[] = children.map(e => e());
  return hs(tag, sinuousAttrs, sinuousChildren);
};

export const elements_ = <T>(items: Observable<T[]>) => (expr: (_: T) => ScreamerElement) => () => {
  console.log(`Items to map: ${sample(items)}`);
  //  console.log(`Example mapping: ${expr(items()[0])()}`);
  return map(items, (item: T) => expr(item)());
};

export const on_ = (name: string) => (onEvent: (e: Event) => (() => void)) => {
  return {
    key: "on" + name,
    value: () => (e: Event) => onEvent(e)()
  } as ScreamerAttribute;
};

export const _effectfulSignal = <T>(o: Observable<() => T>) => () => {
  return computed(() => o());
}

export const mount = (selector: string) => (app: ScreamerElement) => () => {
  const mountPoint = document.querySelector(selector);
  if (mountPoint) {
    mountPoint.appendChild(app());
  } else {
    console.error(
      `unable to mount at selector "${selector}" because the document has no matching element`
    );
  }
}

// FAKERY

export const tick = (counter: Observable<number>) => () => {
  subscribe(() => {
    setInterval(() => counter(1), 100);
  });
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

export const component = () => <T>(c: () => Observable<T>) => () => {
  return h('div', computed(c));
}
