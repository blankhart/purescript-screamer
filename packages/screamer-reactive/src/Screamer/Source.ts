// Foreign module of Screamer.Source.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Source/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

const signalSourceOf = <A>(c: Runtime.Cell<A>) => {
  return {
    signal: c,
    readT1: (): A => c.readT1(),
    putT1: (x: A) => () => c.putT1(x),
    modifyT1: (f: (x: A) => A) => () => c.modifyT1(f),
  };
};

export const signalSource = <A>(a: A) => () => signalSourceOf(R.cell(a));

export const commutingSignalSource = <A>(a: A) => () => {
  const c = R.cell(a);
  c.commutes = true;
  return signalSourceOf(c);
};

const eventSourceOf = <A>(src: Runtime.EventSourceNode<A>) => {
  return {
    event: src,
    fireT1: (x: A) => () => src.fireT1(x),
  };
};

export const eventSource = <A>() => eventSourceOf(R.eventSource<A>());

export const commutingEventSource = <A>() => {
  const src = R.eventSource<A>();
  src.commutes = true;
  return eventSourceOf(src);
};

export const batch = <A>(e: () => A) => (): A => R.batch(e);
