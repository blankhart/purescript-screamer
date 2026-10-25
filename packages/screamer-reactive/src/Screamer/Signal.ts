// Foreign module of Screamer.Signal. Allocating a lazy node has no effect on
// the graph, so the derived signals here are pure. A stateful node is made by
// an effect, which `Screamer.Signal.owned` holds in a scope.
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

export const newDropRepeatsBy = <A>(eq: (x: A) => (y: A) => boolean) => (s: S<A>) => (): S<A> =>
  R.dropRepeatsBy((x: A, y: A) => eq(x)(y), s);

export const withPreviousImpl = <A, T>(tuple: (a: A) => (b: A) => T) => (seed: A) => (s: S<A>) => (): S<T> => {
  const pair = R.stateful<{ previous: A; current: A }>(
    [s],
    () => ({ previous: seed, current: s.read() }),
    (_, values, p) => ({ previous: p.current, current: values[0] }),
    undefined,
    'Signal.withPrevious',
  );
  return R.map((p) => tuple(p.previous)(p.current), pair);
};

export const attemptImpl = <A, T>(left: (e: Error) => T) => (right: (a: A) => T) => (s: S<A>): S<T> =>
  R.derived(() => {
    try {
      return right(s.read());
    } catch (e) {
      return left(e instanceof Error ? e : new Error(String(e)));
    }
  });

// Stateful signals. The node constructors take their arguments uncurried and
// are wrapped below for PureScript, as effects.

/**
 * The latest of `a` and `b`, starting at `a`'s current value; `a` wins when
 * both change in one batch. A merge reports every step, even one that repeats
 * its value, so nested merges agree on which input changed and merging stays
 * associative.
 */
function mergeNode<A>(a: Runtime.Readable<A>, b: Runtime.Readable<A>): Runtime.Readable<A> {
  return R.stateful([a, b], () => a.read(), (changed, values) => (changed[0] ? values[0] : values[1]), never, 'Signal.merge');
}

const never = () => false;

/** Values of `s` that satisfy `p`, starting at `seed` unless `s` satisfies `p` at the start. */
function latestWhereNode<A>(p: (a: A) => boolean, seed: A, s: Runtime.Readable<A>): Runtime.Readable<A> {
  return R.stateful([s], () => {
    const v = s.read();
    return p(v) ? v : seed;
  }, (_, values, prev) => (p(values[0]) ? values[0] : prev), undefined, 'Signal.latestWhere');
}

/**
 * Follows `s` while `cond` is true and holds its last value while `cond` is
 * false. When `cond` becomes true, it takes `s`'s current value. Starts at
 * `s` if `cond` is true at the start, otherwise at `seed`.
 */
function gateSignal<A>(cond: Runtime.Readable<boolean>, seed: A, s: Runtime.Readable<A>): Runtime.Readable<A> {
  return R.stateful([cond, s], () => (cond.read() ? s.read() : seed), (_, values, prev) => (values[0] ? values[1] : prev), undefined, 'Signal.gate');
}

export const mergeImpl = <A>(a: S<A>) => (b: S<A>) => (): S<A> => mergeNode(a, b);

export const latestWhereImpl = <A>(p: (a: A) => boolean) => (seed: A) => (s: S<A>) => (): S<A> => latestWhereNode(p, seed, s);

export const gateImpl = <A>(cond: S<boolean>) => (seed: A) => (s: S<A>) => (): S<A> => gateSignal(cond, seed, s);

export const readT0 = <A>(s: S<A>) => (): A => R.sample(s);

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
