// Foreign module of Screamer.Source.
import type * as Runtime from './Runtime.js';
// @ts-ignore: purs copies this file to output/Screamer.Source/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';

const R: typeof Runtime = runtime;

export const signalSource = <A>(a: A) => () => {
  const c = R.cell(a);
  return {
    signal: c,
    put: (x: A) => () => c.write(x),
    modify: (f: (x: A) => A) => () => c.write(f(c.value)),
  };
};

export const eventSource = <A>() => {
  const src = R.eventSource<A>();
  return {
    event: src,
    fire: (x: A) => () => src.fire(x),
  };
};

export const batch = <A>(e: () => A) => (): A => R.batch(e);
