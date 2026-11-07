// Foreign module of Screamer.Event. Allocating a stateless node has no effect
// on the graph, so those are pure. A stateful node is made by an effect, which
// `Screamer.Event` holds in a scope.
import type * as Runtime from './Runtime.js';
// @ts-ignore: purs copies this file to output/Screamer.Event/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';

const R: typeof Runtime = runtime;

type E<T> = Runtime.EventLike<T>;
type S<T> = Runtime.Readable<T>;

const NONE: Runtime.Occ<any>[] = [];

export const mapImpl = <A, B>(f: (a: A) => B) => (e: E<A>): E<B> => R.mapEvent(f, e);

export const altImpl = <A>(a: E<A>) => (b: E<A>): E<A> => R.alt(a, b);

export const emptyImpl: E<any> = R.neverEvent;

export const filterImpl = <A>(p: (a: A) => boolean) => (e: E<A>): E<A> => R.filterEvent(p, e);

export const filterMapImpl = <A, B>(f: (a: A) => { ok: boolean; v: B }) => (e: E<A>): E<B> => R.filterMapEvent(f, e);

export const changes = <A>(s: S<A>): E<A> => R.changes(s);

export const stepperImpl = <A>(seed: A) => (e: E<A>) => (): S<A> => R.stepper(seed, e);

export const foldImpl = <A, B>(f: (a: A) => (b: B) => B) => (seed: B) => (e: E<A>) => (): S<B> =>
  R.foldEvent((a: A, b: B) => f(a)(b), seed, e);

export const attachWith = <A, B, C>(f: (b: B) => (a: A) => C) => (s: S<B>) => (e: E<A>): E<C> =>
  R.attachWith((b: B, a: A) => f(b)(a), s, e);

export const holdImpl = <A>(s: Runtime.Scope) => (e: E<A>) => (): E<A> => R.runInScope(s, () => R.holdEvent(e));

export const subscribeImpl = <A>(s: Runtime.Scope) => (e: E<A>) => (cb: (a: A) => () => void) => () => {
  R.subscribeEvent(s, e, (a) => cb(a)());
};

// Transform, filter and accumulate (#19). Each stateful combinator is an
// `accumEvent` state machine, made by an effect; `seed` makes its state.

type Accum<S, B> = Runtime.Accum<S, B>;
const accum = <A, S, B>(f: (a: A, s: S) => Accum<S, B>, seed: () => S) => (e: E<A>) => (): E<B> =>
  R.accumEvent(f, seed, e);

export const gate = <A>(cond: S<boolean>) => (e: E<A>): E<A> => gateNode(cond, e);

export const mapAccumImpl = <A, S, B>(f: (a: A) => (s: S) => { state: S; value: B }) => (seed: S) =>
  accum<A, S, B>((a, s) => {
    const r = f(a)(s);
    return { state: r.state, emit: true, value: r.value };
  }, () => seed);

interface Prev<A> {
  has: boolean;
  v: A;
}

const noPrev = (): Prev<any> => ({ has: false, v: undefined });

export const withPreviousImpl = <A>(e: E<A>): (() => E<{ previous: A; current: A }>) =>
  accum<A, Prev<A>, { previous: A; current: A }>(
    (a, p) => (p.has
      ? { state: { has: true, v: a }, emit: true, value: { previous: p.v, current: a } }
      : { state: { has: true, v: a }, emit: false }),
    noPrev,
  )(e);

export const dropRepeatsByImpl = <A>(eq: (x: A) => (y: A) => boolean) => (e: E<A>): (() => E<A>) =>
  accum<A, Prev<A>, A>(
    (a, p) => ({ state: { has: true, v: a }, emit: !p.has || !eq(p.v)(a), value: a }),
    noPrev,
  )(e);

// Combining several streams (#20). Node constructors with more than one
// argument take them uncurried and are wrapped below for PureScript.

/** All the inputs' occurrences in stamp order; on equal stamps, earlier inputs first. */
export function oneOf<A>(es: Runtime.EventLike<A>[]): Runtime.EventLike<A> {
  const ins = es.filter((e) => e !== R.neverEvent);
  if (ins.length === 0) return R.neverEvent;
  if (ins.length === 1) return ins[0];
  return R.eventDerived((r) => {
    let out: Runtime.Occ<A>[] = NONE;
    let lists = 0;
    for (let i = 0; i < ins.length; i++) {
      const os = r.occ(ins[i]);
      if (os.length === 0) continue;
      out = lists === 0 ? os : out.concat(os);
      lists++;
    }
    // A stable sort keeps earlier inputs first on equal stamps.
    return lists > 1 ? out.slice().sort((x, y) => x.s - y.s) : out;
  });
}

// Flattening (#21).

export const switchEvent = <A>(s: S<E<A>>): E<A> => R.switchEvent(s);

/** The occurrences of every event in the signal's array, in fire order. */
export function mergeAll<A>(s: Runtime.Readable<Runtime.EventLike<A>[]>): Runtime.EventLike<A> {
  return R.eventDerived((r) => {
    const es = s.read();
    let out: Runtime.Occ<A>[] = NONE;
    let lists = 0;
    for (let i = 0; i < es.length; i++) {
      const os = r.occ(es[i]);
      if (os.length === 0) continue;
      out = lists === 0 ? os : out.concat(os);
      lists++;
    }
    return lists > 1 ? out.slice().sort((x, y) => x.s - y.s) : out;
  });
}

/** The occurrences of `e` in rounds that end with `cond` true. */
function gateNode<A>(cond: Runtime.Readable<boolean>, e: Runtime.EventLike<A>): Runtime.EventLike<A> {
  return R.eventDerived((r) => {
    const open = cond.read();
    const os = r.occ(e);
    return open ? os : NONE;
  });
}
