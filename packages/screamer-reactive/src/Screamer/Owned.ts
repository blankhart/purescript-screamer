// Foreign module of Screamer.Owned.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Owned/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Scope = Runtime.Scope;
type Eff<A> = () => A;

/** Run an `Owned` body (a function of the scope) in `s`, inside a batch. */
const runIn = <A>(s: Scope, body: (s: Scope) => Eff<A>): A =>
  R.batch(() => R.runInScope(s, () => body(s)()));

export const onCleanupImpl = (s: Scope) => (e: Eff<void>) => () => {
  if (s.disposed) throw new Error('onCleanup in a disposed scope');
  s.cleanups.push(e);
};

const result = <A>(value: A, s: Scope) => ({ value, dispose: () => R.batch(() => s.dispose()) });

export const childImpl = <A>(s: Scope) => (body: (s: Scope) => Eff<A>) => () => {
  const c = R.createScope(s);
  return result(runIn(c, body), c);
};

export const runOwnedImpl = <A>(body: (s: Scope) => Eff<A>) => () => {
  const s = R.createScope(null);
  s.onError = (e) => {
    console.error(e);
    throw e;
  };
  let value: A;
  try {
    value = runIn(s, body);
  } catch (e) {
    s.dispose();
    throw e;
  }
  return result(value, s);
};

export const onErrorImpl = (s: Scope) => (handler: (e: unknown) => Eff<void>) => () => {
  s.onError = (e) => handler(e instanceof Error ? e : new Error(String(e)))();
};
