// Foreign module of Screamer.Signal. Allocating a lazy node has no effect on
// the graph, so everything here is pure except `read`, `subscribeImpl` and
// `holdImpl`.
import type * as Runtime from './Runtime.js';
// @ts-ignore: purs copies this file to output/Screamer.Signal/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';

const R: typeof Runtime = runtime;

type S<T> = Runtime.Readable<T>;

export const mapImpl = <A, B>(f: (a: A) => B) => (s: S<A>): S<B> => R.map(f, s);

export const applyImpl = <A, B>(sf: S<(a: A) => B>) => (sa: S<A>): S<B> => R.apply(sf, sa);

export const pureImpl = <A>(a: A): S<A> => R.constant(a);

export const bindImpl = <A, B>(s: S<A>) => (f: (a: A) => S<B>): S<B> =>
  s instanceof R.Constant ? f(s.value) : R.bind(s, f);

export const sampleOn = <A>(a: S<A>) => <B>(b: S<B>): S<B> =>
  R.derived(() => {
    a.read();
    return R.sample(b);
  });

export const dropRepeatsByImpl = <A>(eq: (x: A) => (y: A) => boolean) => (s: S<A>): S<A> =>
  R.dropRepeatsBy((x: A, y: A) => eq(x)(y), s);

export const withPreviousImpl = <A, T>(tuple: (a: A) => (b: A) => T) => (seed: A) => (s: S<A>): S<T> => {
  const pair = R.stateful<{ previous: A; current: A }>(
    [s],
    () => ({ previous: seed, current: s.read() }),
    (_, values, p) => ({ previous: p.current, current: values[0] }),
  );
  return R.map((p) => tuple(p.previous)(p.current), pair);
};

export const combine = <A>(ss: S<A>[]): S<A[]> => R.combine(ss);

export const withLatestImpl = <A, B, T>(pair: (a: A) => (b: B) => T) => (b: S<B>) => (a: S<A>): S<T> =>
  R.withLatest((x: A, y: B) => pair(x)(y), b, a);

export const history = (n: number) => <A>(s: S<A>): S<A[]> =>
  R.stateful<A[]>([s], () => (n > 0 ? [s.read()] : []), (_, values, xs) => {
    const next = xs.concat([values[0]]);
    return next.length > n ? next.slice(next.length - n) : next;
  });

export const attemptImpl = <A, T>(left: (e: Error) => T) => (right: (a: A) => T) => (s: S<A>): S<T> =>
  R.derived(() => {
    try {
      return right(s.read());
    } catch (e) {
      return left(e instanceof Error ? e : new Error(String(e)));
    }
  });

export const merge = <A>(a: S<A>) => (b: S<A>): S<A> => R.merge(a, b);

export const latestWhere = <A>(p: (a: A) => boolean) => (seed: A) => (s: S<A>): S<A> => R.latestWhere(p, seed, s);

export const gate = <A>(cond: S<boolean>) => (seed: A) => (s: S<A>): S<A> => R.gateSignal(cond, seed, s);

export const read = <A>(s: S<A>) => (): A => R.sample(s);

export const subscribeImpl = <A>(s: Runtime.Scope) => (sig: S<A>) => (cb: (a: A) => () => void) => () => {
  R.runInScope(s, () => {
    R.effect(() => {
      const v = sig.read();
      R.untracked(() => cb(v)());
    });
  });
};

export const holdImpl = <A>(s: Runtime.Scope) => (sig: S<A>) => (): S<A> => R.runInScope(s, () => R.hold(sig));

export const sampleManyWithImpl =
  (sampled: Record<string, S<any>>) => (tracked: Record<string, S<any>>) => <C>(f: (r: any) => C): S<C> => {
    const sampledKeys = Object.keys(sampled);
    const trackedKeys = Object.keys(tracked);
    return R.derived(() => {
      const obj: Record<string, any> = {};
      for (const k of sampledKeys) obj[k] = R.sample(sampled[k]);
      for (const k of trackedKeys) obj[k] = tracked[k].read();
      return f(obj);
    });
  };
