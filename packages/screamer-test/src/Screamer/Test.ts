// Foreign module of Screamer.Test.
import type * as Runtime from '../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Test/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

export const observe = <A>(s: Runtime.Readable<A>) => () => {
  const trace: A[] = [];
  const stop = R.scope(() => {
    R.effect(() => { trace.push(s.read()); });
  }, null);
  return { trace: () => trace.slice(), stop };
};

export const exit = (code: number) => () => {
  (globalThis as any).process.exitCode = code;
};

/** Turn strict mode on: development warnings are thrown as errors. */
export const strict = () => {
  R.setStrict(true);
};

export const withoutStrict = <A>(action: () => A) => (): A => {
  const was = R.isStrict();
  R.setStrict(false);
  try {
    return action();
  } finally {
    R.setStrict(was);
  }
};
