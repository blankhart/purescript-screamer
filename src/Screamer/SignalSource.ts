// Foreign module of Screamer.SignalSource.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.SignalSource/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

export const signalSource = <A>(a: A) => () => {
  const c = R.cell(a);
  return {
    signal: c,
    put: (x: A) => () => c.write(x),
    modify: (f: (x: A) => A) => () => c.write(f(c.value)),
  };
};

export const batch = <A>(e: () => A) => (): A => R.batch(e);
