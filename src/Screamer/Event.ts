// Foreign module of Screamer.Event. Allocating an event node has no effect
// on the graph, so everything here is pure except `subscribeImpl`.
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

export const stepper = <A>(seed: A) => (e: E<A>): S<A> => R.stepper(seed, e);

export const fold = <A, B>(f: (a: A) => (b: B) => B) => (seed: B) => (e: E<A>): S<B> =>
  R.foldEvent((a: A, b: B) => f(a)(b), seed, e);

export const attachWith = <A, B, C>(f: (b: B) => (a: A) => C) => (s: S<B>) => (e: E<A>): E<C> =>
  R.attachWith((b: B, a: A) => f(b)(a), s, e);

export const holdImpl = <A>(s: Runtime.Scope) => (e: E<A>) => (): E<A> => R.runInScope(s, () => R.holdEvent(e));

export const subscribeImpl = <A>(s: Runtime.Scope) => (e: E<A>) => (cb: (a: A) => () => void) => () => {
  R.subscribeEvent(s, e, (a) => cb(a)());
};

// Transform, filter and accumulate (#19). Each stateful combinator is an
// `accumEvent` state machine; `seed` makes a fresh state when first observed.

type Accum<S, B> = Runtime.Accum<S, B>;
const accum = <A, S, B>(f: (a: A, s: S) => Accum<S, B>, seed: () => S) => (e: E<A>): E<B> =>
  R.accumEvent(f, seed, e);

export const gate = <A>(cond: S<boolean>) => (e: E<A>): E<A> => gateNode(cond, e);

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

/** The occurrences of the leftmost input that fired in the round. */
export function leftmost<A>(es: Runtime.EventLike<A>[]): Runtime.EventLike<A> {
  return R.eventDerived((r) => {
    let out: Runtime.Occ<A>[] = NONE;
    // Read every input, so each records its version and stays linked.
    for (let i = 0; i < es.length; i++) {
      const os = r.occ(es[i]);
      if (out.length === 0) out = os;
    }
    return out;
  });
}

/**
 * Both events' occurrences in stamp order. An occurrence of each with the
 * same stamp (both derived from one fire) are combined with `both`.
 */
function mergeWithNode<A, B, C>(
  both: (a: A, b: B) => C,
  left: (a: A) => C,
  right: (b: B) => C,
  ea: Runtime.EventLike<A>,
  eb: Runtime.EventLike<B>,
): Runtime.EventLike<C> {
  return R.eventDerived((r) => {
    const as = r.occ(ea);
    const bs = r.occ(eb);
    if (as.length === 0 && bs.length === 0) return NONE;
    const out: Runtime.Occ<C>[] = [];
    let i = 0;
    let j = 0;
    while (i < as.length || j < bs.length) {
      if (j >= bs.length || (i < as.length && as[i].s < bs[j].s)) {
        out.push({ s: as[i].s, v: left(as[i].v) });
        i++;
      } else if (i >= as.length || bs[j].s < as[i].s) {
        out.push({ s: bs[j].s, v: right(bs[j].v) });
        j++;
      } else {
        out.push({ s: as[i].s, v: both(as[i].v, bs[j].v) });
        i++;
        j++;
      }
    }
    return out;
  });
}

interface ZipState<A, B> {
  as: Runtime.Occ<A>[];
  bs: Runtime.Occ<B>[];
}

/**
 * Pairs the nth occurrence of `ea` with the nth of `eb`, counting from when
 * it is observed. Unpaired occurrences queue without bound. A paused zip
 * drops its queues, because what they would be paired with is missed.
 */
function zip<A, B, C>(f: (a: A, b: B) => C, ea: Runtime.EventLike<A>, eb: Runtime.EventLike<B>): Runtime.EventLike<C> {
  return R.eventStateful<ZipState<A, B>, C>(
    [ea, eb],
    () => ({ as: [], bs: [] }),
    (changed, values, st) => {
      // Take the round's occurrences in stamp order, pairing as they come.
      const as = changed[0] ? (values[0] as Runtime.Occ<A>[]) : NONE;
      const bs = changed[1] ? (values[1] as Runtime.Occ<B>[]) : NONE;
      const qa = st.as.slice();
      const qb = st.bs.slice();
      const out: Runtime.Occ<C>[] = [];
      let i = 0;
      let j = 0;
      while (i < as.length || j < bs.length) {
        const takeA = j >= bs.length || (i < as.length && as[i].s <= bs[j].s);
        if (takeA) {
          const o = as[i++];
          if (qb.length > 0) out.push({ s: o.s, v: f(o.v, qb.shift()!.v) });
          else qa.push(o);
        } else {
          const o = bs[j++];
          if (qa.length > 0) out.push({ s: o.s, v: f(qa.shift()!.v, o.v) });
          else qb.push(o);
        }
      }
      return { state: { as: qa, bs: qb }, out };
    },
    () => ({ as: [], bs: [] }),
  );
}

/**
 * Follows the first input to fire after it is first observed (the leftmost,
 * if several fire in that round), and ignores the others from then on.
 */
export function race<A>(es: Runtime.EventLike<A>[]): Runtime.EventLike<A> {
  return R.eventStateful<number, A>(es, () => -1, (changed, values, winner) => {
    if (winner < 0) winner = changed.indexOf(true);
    return { state: winner, out: winner >= 0 && changed[winner] ? values[winner] : NONE };
  });
}

export const mergeWith = <A, B, C>(both: (a: A) => (b: B) => C) => (left: (a: A) => C) => (right: (b: B) => C) =>
  (ea: E<A>) => (eb: E<B>): E<C> => mergeWithNode((a: A, b: B) => both(a)(b), left, right, ea, eb);

export const zipWith = <A, B, C>(f: (a: A) => (b: B) => C) => (ea: E<A>) => (eb: E<B>): E<C> =>
  zip((a: A, b: B) => f(a)(b), ea, eb);

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
    const as: Runtime.Occ<A>[] = changed[0] ? values[0] : [];
    const ns: Runtime.Occ<B>[] = changed[1] ? values[1] : [];
    const out: Runtime.Occ<A[]>[] = [];
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
      const os: Runtime.Occ<A>[] = changed[1] ? values[1] : [];
      if (open) return { state: { open, buf: st.buf.concat(os.map((o) => o.v)) }, out: [] };
      // Closed at the end of the round: emit what the window held, if it was open.
      const out = st.open ? [{ s: R.signalStamp(), v: st.buf }] : [];
      return { state: { open, buf: [] }, out };
    },
  );
