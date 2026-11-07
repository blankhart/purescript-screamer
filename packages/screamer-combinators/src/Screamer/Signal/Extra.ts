// Foreign module of Screamer.Signal.Extra.
import type * as Runtime from '../../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Signal.Extra/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type S<T> = Runtime.Readable<T>;

/** The current values of all the signals, as one node. */
export function combine<A>(ss: Runtime.Readable<A>[]): Runtime.Readable<A[]> {
  if (ss.every((s) => R.isConstant(s))) return R.constant(ss.map((s) => (s as Runtime.Constant<A>).value));
  return R.derived(() => {
    const out = new Array<A>(ss.length);
    for (let i = 0; i < ss.length; i++) out[i] = ss[i].read();
    return out;
  });
}

/**
 * `a`'s value paired with `b`'s, changing only when `a` changes.
 */
function withLatest<A, B, T>(pair: (a: A, b: B) => T, b: Runtime.Readable<B>, a: Runtime.Readable<A>): Runtime.Readable<T> {
  return R.stateful<T>([a, b], () => pair(a.read(), b.read()), (changed, values) =>
    (changed[0] ? pair(values[0], values[1]) : R.noUpdate));
}

export const withLatestImpl = <A, B, T>(pair: (a: A) => (b: B) => T) => (b: S<B>) => (a: S<A>) => (): S<T> =>
  withLatest((x: A, y: B) => pair(x)(y), b, a);

export const historyImpl = (n: number) => <A>(s: S<A>) => (): S<A[]> =>
  R.stateful<A[]>([s], () => (n > 0 ? [s.read()] : []), (_, values, xs) => {
    const next = xs.concat([values[0]]);
    return next.length > n ? next.slice(next.length - n) : next;
  });
