// Foreign module of Screamer.Signal. Allocating a lazy node has no effect on
// the graph, so everything here is pure except `read`.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Signal/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

type S<T> = Core.Readable<T>;

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

export const fold = <A, B>(f: (a: A) => (b: B) => B) => (seed: B) => (s: S<A>): S<B> =>
  R.fold((a: A, b: B) => f(a)(b), seed, s);

export const withPreviousImpl = <A, T>(tuple: (a: A) => (b: A) => T) => (seed: A) => (s: S<A>): S<T> => {
  const pair = R.stateful<{ previous: A; current: A }>(
    [s],
    () => ({ previous: seed, current: s.read() }),
    (_, values, p) => ({ previous: p.current, current: values[0] }),
  );
  return R.map((p) => tuple(p.previous)(p.current), pair);
};

export const merge = <A>(a: S<A>) => (b: S<A>): S<A> => R.merge(a, b);

export const filter = <A>(p: (a: A) => boolean) => (seed: A) => (s: S<A>): S<A> => R.filter(p, seed, s);

export const filterOn = <A>(cond: S<boolean>) => (seed: A) => (s: S<A>): S<A> => R.filterOn(cond, seed, s);

export const read = <A>(s: S<A>) => (): A => R.sample(s);

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
