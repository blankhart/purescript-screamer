// Foreign module of Screamer.Source.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Source/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

export const signalSource = <A>(a: A) => () => {
  const c = R.cell(a);
  return {
    signal: c,
    readT1: (): A => c.readT1(),
    putT1: (x: A) => () => c.putT1(x),
    modifyT1: (f: (x: A) => A) => () => c.modifyT1(f),
  };
};

export const eventSource = <A>() => {
  const src = R.eventSource<A>();
  return {
    event: src,
    fireT1: (x: A) => () => src.fireT1(x),
  };
};

export const batch = <A>(e: () => A) => (): A => R.batch(e);
