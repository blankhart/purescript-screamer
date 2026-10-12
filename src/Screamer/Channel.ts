// Foreign module of Screamer.Channel.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Channel/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

export const channel = <A>(a: A) => () => {
  const c = R.cell(a);
  return {
    signal: c,
    put: (x: A) => () => c.write(x),
    modify: (f: (x: A) => A) => () => c.write(f(c.value)),
  };
};

export const batch = <A>(e: () => A) => (): A => R.batch(e);
