// Foreign module of Screamer.Event. Allocating an event node has no effect
// on the graph, so everything here is pure except `subscribeImpl`.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Event/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

type E<T> = Core.EventLike<T>;
type S<T> = Core.Readable<T>;

export const mapImpl = <A, B>(f: (a: A) => B) => (e: E<A>): E<B> => R.mapEvent(f, e);

export const altImpl = <A>(a: E<A>) => (b: E<A>): E<A> => R.alt(a, b);

export const emptyImpl: E<any> = R.neverEvent;

export const filterImpl = <A>(p: (a: A) => boolean) => (e: E<A>): E<A> => R.filterEvent(p, e);

export const filterMapImpl = <A, B>(f: (a: A) => { ok: boolean; v: B }) => (e: E<A>): E<B> => R.filterMapEvent(f, e);

export const changes = <A>(s: S<A>): E<A> => R.changes(s);

export const stepper = <A>(seed: A) => (e: E<A>): S<A> => R.stepper(seed, e);

export const fold = <A, B>(f: (a: A) => (b: B) => B) => (seed: B) => (e: E<A>): S<B> =>
  R.foldEvent((a: A, b: B) => f(a)(b), seed, e);

export const attachWith = <A, B, C>(f: (b: B) => (a: A) => C) => (s: S<B>) => (e: E<A>): E<C> =>
  R.attachWith((b: B, a: A) => f(b)(a), s, e);

export const subscribeImpl = <A>(s: Core.Scope) => (e: E<A>) => (cb: (a: A) => () => void) => () => {
  R.subscribeEvent(s, e, (a) => cb(a)());
};

// Transform, filter and accumulate (#19). Each stateful combinator is an
// `accumEvent` state machine; `seed` makes a fresh state when first observed.

type Accum<S, B> = Core.Accum<S, B>;
const accum = <A, S, B>(f: (a: A, s: S) => Accum<S, B>, seed: () => S) => (e: E<A>): E<B> =>
  R.accumEvent(f, seed, e);

export const gate = <A>(cond: S<boolean>) => (e: E<A>): E<A> => R.gate(cond, e);

export const mapAccum = <A, S, B>(f: (a: A) => (s: S) => { state: S; value: B }) => (seed: S) =>
  accum<A, S, B>((a, s) => {
    const r = f(a)(s);
    return { state: r.state, emit: true, value: r.value };
  }, () => seed);

interface Prev<A> {
  has: boolean;
  v: A;
}

const noPrev = (): Prev<any> => ({ has: false, v: undefined });

export const withPrevious = <A>(e: E<A>): E<{ previous: A; current: A }> =>
  accum<A, Prev<A>, { previous: A; current: A }>(
    (a, p) => (p.has
      ? { state: { has: true, v: a }, emit: true, value: { previous: p.v, current: a } }
      : { state: { has: true, v: a }, emit: false }),
    noPrev,
  )(e);

export const dropRepeatsByImpl = <A>(eq: (x: A) => (y: A) => boolean) => (e: E<A>): E<A> =>
  accum<A, Prev<A>, A>(
    (a, p) => ({ state: { has: true, v: a }, emit: !p.has || !eq(p.v)(a), value: a }),
    noPrev,
  )(e);

export const take = (n: number) => <A>(e: E<A>): E<A> =>
  accum<A, number, A>((a, k) => (k < n ? { state: k + 1, emit: true, value: a } : { state: k, emit: false }), () => 0)(e);

export const skip = (n: number) => <A>(e: E<A>): E<A> =>
  accum<A, number, A>((a, k) => (k < n ? { state: k + 1, emit: false } : { state: k, emit: true, value: a }), () => 0)(e);

export const takeWhile = <A>(p: (a: A) => boolean) => (e: E<A>): E<A> =>
  accum<A, boolean, A>((a, done) => (!done && p(a) ? { state: false, emit: true, value: a } : { state: true, emit: false }), () => false)(e);

export const skipWhile = <A>(p: (a: A) => boolean) => (e: E<A>): E<A> =>
  accum<A, boolean, A>((a, open) => (open || !p(a) ? { state: true, emit: true, value: a } : { state: false, emit: false }), () => false)(e);

// Combining several streams (#20).

export const oneOf = <A>(es: E<A>[]): E<A> => R.oneOf(es);

export const leftmost = <A>(es: E<A>[]): E<A> => R.leftmost(es);

export const mergeWith = <A, B, C>(both: (a: A) => (b: B) => C) => (left: (a: A) => C) => (right: (b: B) => C) =>
  (ea: E<A>) => (eb: E<B>): E<C> => R.mergeWith((a: A, b: B) => both(a)(b), left, right, ea, eb);

export const zipWith = <A, B, C>(f: (a: A) => (b: B) => C) => (ea: E<A>) => (eb: E<B>): E<C> =>
  R.zip((a: A, b: B) => f(a)(b), ea, eb);

export const race = <A>(es: E<A>[]): E<A> => R.race(es);

// Flattening (#21).

export const switchEvent = <A>(s: S<E<A>>): E<A> => R.switchEvent(s);

// Buffering (#23). A paused buffer keeps what it holds, like any stateful node.

export const bufferCount = (n: number) => (step: number) => <A>(e: E<A>): E<A[]> => {
  const size = Math.max(1, n);
  const every = Math.max(1, step);
  return accum<A, { seen: number; open: A[][] }, A[]>((a, st) => {
    const open = st.seen % every === 0 ? st.open.concat([[]]) : st.open.slice();
    let full: A[] | null = null;
    for (let i = 0; i < open.length; i++) {
      open[i] = open[i].concat([a]);
      if (open[i].length === size && full === null) full = open[i];
    }
    const rest = full === null ? open : open.filter((b) => b !== full);
    return { state: { seen: st.seen + 1, open: rest }, emit: full !== null, value: full ?? undefined };
  }, () => ({ seen: 0, open: [] }))(e);
};

export const bufferOn = <B>(notifier: E<B>) => <A>(e: E<A>): E<A[]> =>
  R.eventStateful<A[], A[]>([e, notifier], () => [], (changed, values, held) => {
    const as: Core.Occ<A>[] = changed[0] ? values[0] : [];
    const ns: Core.Occ<B>[] = changed[1] ? values[1] : [];
    const out: Core.Occ<A[]>[] = [];
    let buf = held;
    let i = 0;
    for (let j = 0; j < ns.length; j++) {
      // Occurrences fired up to the notifier's (inclusive) go in its buffer.
      const take: A[] = [];
      while (i < as.length && as[i].s <= ns[j].s) take.push(as[i++].v);
      out.push({ s: ns[j].s, v: buf.concat(take) });
      buf = [];
    }
    while (i < as.length) buf = buf.concat([as[i++].v]);
    return { state: buf, out };
  });

export const bufferWhile = (cond: S<boolean>) => <A>(e: E<A>): E<A[]> =>
  R.eventStateful<{ open: boolean; buf: A[] }, A[]>(
    [cond, e],
    () => ({ open: cond.read(), buf: [] }),
    (changed, values, st) => {
      const open: boolean = values[0];
      const os: Core.Occ<A>[] = changed[1] ? values[1] : [];
      if (open) return { state: { open, buf: st.buf.concat(os.map((o) => o.v)) }, out: [] };
      // Closed at the end of the round: emit what the window held, if it was open.
      const out = st.open ? [{ s: R.signalStamp(), v: st.buf }] : [];
      return { state: { open, buf: [] }, out };
    },
  );
