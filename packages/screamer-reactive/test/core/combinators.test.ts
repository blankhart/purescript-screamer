// Combinators that live in the foreign modules of `Screamer.Event` and
// `Screamer.Signal`, and of their `Extra` modules in screamer-combinators,
// built on the runtime's public node constructors.
//
// Everything here comes from `output/`, where purs puts the foreign modules
// next to each other: importing the runtime from `src/` as well would create
// a second runtime, whose nodes the combinators would not recognize. The
// combinators are exported curried, for PureScript; the wrappers below give
// them the runtime's uncurried shapes, so the tests read as before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Readable, EventLike } from '../../src/Screamer/Runtime.ts';
// @ts-ignore: built by `spago build`, which `npm run test:core` runs first.
import * as runtime from '../../../../output/Screamer.Runtime/foreign.js';
// @ts-ignore: as above.
import * as event from '../../../../output/Screamer.Event/foreign.js';
// @ts-ignore: as above.
import * as signal from '../../../../output/Screamer.Signal/foreign.js';
// @ts-ignore: as above.
import * as eventExtra from '../../../../output/Screamer.Event.Extra/foreign.js';
// @ts-ignore: as above.
import * as signalExtra from '../../../../output/Screamer.Signal.Extra/foreign.js';

const {
  cell, derived, bind, stateful, hold, scope, effect, batch,
  eventSource, mapEvent, filterEvent, alt, changes, stepper, foldEvent, attachWith,
  subscribeEvent, holdEvent, accumEvent, touch,
} = runtime;

// The stateful constructors are effects that make a node; these tests call
// them directly, outside any scope, to exercise the nodes themselves.
const curry2 = <A, B, C>(f: (a: A, b: B) => C) => (a: A) => (b: B) => f(a, b);

const { oneOf, mergeAll } = event;
const { leftmost } = eventExtra;
const race = <A>(es: EventLike<A>[]): EventLike<A> => eventExtra.raceImpl(es)();
const mergeWith = <A, B, C>(both: (a: A, b: B) => C, left: (a: A) => C, right: (b: B) => C, ea: EventLike<A>, eb: EventLike<B>): EventLike<C> =>
  eventExtra.mergeWith(curry2(both))(left)(right)(ea)(eb);
const zip = <A, B, C>(f: (a: A, b: B) => C, ea: EventLike<A>, eb: EventLike<B>): EventLike<C> => eventExtra.zipWithImpl(curry2(f))(ea)(eb)();
const gate = <A>(cond: Readable<boolean>, e: EventLike<A>): EventLike<A> => event.gate(cond)(e);

const { combine } = signalExtra;
const merge = <A>(a: Readable<A>, b: Readable<A>): Readable<A> => signal.mergeImpl(a)(b)();
const latestWhere = <A>(p: (a: A) => boolean, seed: A, s: Readable<A>): Readable<A> => signal.latestWhereImpl(p)(seed)(s)();
const gateSignal = <A>(cond: Readable<boolean>, seed: A, s: Readable<A>): Readable<A> => signal.gateImpl(cond)(seed)(s)();
const withLatest = <A, B, T>(pair: (a: A, b: B) => T, b: Readable<B>, a: Readable<A>): Readable<T> =>
  signalExtra.withLatestImpl(curry2(pair))(b)(a)();

/** Record each occurrence of `e` until stopped. */
function record<A>(e: EventLike<A>) {
  const seen: A[] = [];
  const stop = scope((s) => { subscribeEvent(s, e, (a) => { seen.push(a); }); });
  return { seen, stop };
}

// A stateful signal that accumulates its input, one step per batch in which
// the input changed (see stateful.test.ts).
const fold = <A, B>(f: (a: A, b: B) => B, seed: B, s: Readable<A>): Readable<B> =>
  stateful([s], () => seed, (_: boolean[], values: any[], b: B) => f(values[0], b));

describe('prototype checks', () => {
  test('7 merge: latest wins, simultaneous writes prefer the left input', () => {
    const a = cell('a0');
    const b = cell('b0');
    const m = merge(a, b);
    const seen: string[] = [];
    const stop = scope(() => { effect(() => { seen.push(m.read()); }); });
    b.putT1('b1');
    a.putT1('a1');
    batch(() => { a.putT1('a2'); b.putT1('b2'); });
    assert.equal(seen.join(' '), 'a0 b1 a1 a2');
    stop();
  });

  test('7b merge built under a re-running parent keeps listening', () => {
    const a = cell('a0');
    const b = cell('b0');
    const t = cell(0);
    let m: Readable<string> | null = null;
    const s1 = scope(() => { effect(() => { t.read(); if (!m) m = merge(a, b); }); });
    const s2 = scope(() => { effect(() => { m!.read(); }); });
    t.putT1(1);
    b.putT1('b1');
    assert.equal(m!.read(), 'b1');
    s1();
    s2();
  });

  test('8 latestWhere', () => {
    const s = cell(1);
    const evens = latestWhere((x: number) => x % 2 === 0, 0, s);
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(evens.read()); }); });
    s.putT1(2);
    s.putT1(3);
    s.putT1(4);
    assert.equal(seen.join(' '), '0 2 4');
    stop();
  });
});

describe('gateSignal', () => {
  test('follows the source while the condition holds and keeps its value otherwise', () => {
    const cond = cell(true);
    const src = cell(1);
    const f = gateSignal(cond, 0, src);
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(f.read()); }); });
    src.putT1(2);
    cond.putT1(false);
    src.putT1(3);
    src.putT1(4);
    cond.putT1(true);
    src.putT1(5);
    batch(() => { cond.putT1(false); src.putT1(6); });
    batch(() => { cond.putT1(true); src.putT1(7); });
    assert.deepEqual(seen, [1, 2, 4, 5, 7]);
    stop();
  });

  test('starts at the seed when the condition is false', () => {
    const cond = cell(false);
    const src = cell(1);
    const f = gateSignal(cond, 0, src);
    assert.equal(f.read(), 0);
  });
});

describe('stateful event nodes', () => {
  test('gate passes the occurrences of rounds that end with the condition true', () => {
    const open = cell(false);
    const src = eventSource<number>();
    const r = record(gate(open, src));
    src.fireT1(1);
    batch(() => { src.fireT1(2); open.putT1(true); });
    src.fireT1(3);
    batch(() => { src.fireT1(4); open.putT1(false); });
    assert.deepEqual(r.seen, [2, 3]);
    r.stop();
  });
});

describe('combining', () => {
  const pair = (a: unknown, b: unknown) => `${a}${b}`;

  test('oneOf interleaves every input by fire order', () => {
    const [a, b, c] = [eventSource<string>(), eventSource<string>(), eventSource<string>()];
    const r = record(oneOf([a, b, c]));
    batch(() => { c.fireT1('c1'); a.fireT1('a1'); b.fireT1('b1'); c.fireT1('c2'); });
    assert.deepEqual(r.seen, ['c1', 'a1', 'b1', 'c2']);
    r.stop();
  });

  test('leftmost keeps the leftmost input that fired in the round', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const r = record(leftmost([a, b]));
    batch(() => { b.fireT1('b1'); a.fireT1('a1'); a.fireT1('a2'); });
    b.fireT1('b2');
    assert.deepEqual(r.seen, ['a1', 'a2', 'b2']);
    r.stop();
  });

  test('mergeWith combines occurrences of one fire and loses nothing', () => {
    const src = eventSource<number>();
    const other = eventSource<number>();
    const e = mergeWith((x: number, y: number) => `both${x},${y}`, (x: number) => `L${x}`, (y: number) => `R${y}`,
      mapEvent((x: number) => x, src), alt(mapEvent((x: number) => -x, src), other));
    const r = record(e);
    batch(() => { src.fireT1(1); other.fireT1(9); src.fireT1(2); });
    assert.deepEqual(r.seen, ['both1,-1', 'R9', 'both2,-2']);
    r.stop();
  });

  test('zip pairs the nth with the nth, across rounds and within one', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const r = record(zip(pair, a, b));
    batch(() => { a.fireT1('a1'); a.fireT1('a2'); b.fireT1('b1'); });
    b.fireT1('b2');
    b.fireT1('b3');
    a.fireT1('a3');
    assert.deepEqual(r.seen, ['a1b1', 'a2b2', 'a3b3']);
    r.stop();
  });

  test('zip drops its queues when unobserved', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const z = zip(pair, a, b);
    const keep = scope(() => { holdEvent(a); holdEvent(b); });
    let r = record(z);
    a.fireT1('a1');
    a.fireT1('a2');
    r.stop();
    r = record(z);
    b.fireT1('b1');
    a.fireT1('a3');
    assert.deepEqual(r.seen, ['a3b1']);
    r.stop();
    keep();
  });

  test('race follows the first input to fire, the leftmost on a tie', () => {
    const [a, b, c] = [eventSource<string>(), eventSource<string>(), eventSource<string>()];
    const r = record(race([a, b, c]));
    batch(() => { c.fireT1('c1'); b.fireT1('b1'); });
    a.fireT1('a1');
    b.fireT1('b2');
    assert.deepEqual(r.seen, ['b1', 'b2']);
    r.stop();
  });

  test('combine is one node over every signal', () => {
    const cs = [cell(1), cell(2), cell(3)];
    const all = combine(cs);
    const seen: string[] = [];
    let runs = 0;
    const stop = scope(() => { effect(() => { seen.push(all.read().join()); runs++; }); });
    batch(() => { cs[0].putT1(4); cs[2].putT1(6); });
    assert.deepEqual(seen, ['1,2,3', '4,2,6']);
    assert.equal(runs, 2);
    stop();
  });

  test('withLatest changes only with its driver, and keeps the other observed', () => {
    const a = cell(1);
    const src = eventSource<number>();
    const total = foldEvent((x: number, n: number) => n + x, 0, src);
    const w = withLatest((x: number, y: number) => `${x}/${y}`, total, a);
    const seen: string[] = [];
    const stop = scope(() => { effect(() => { seen.push(w.read()); }); });
    src.fireT1(5);
    src.fireT1(5);
    a.putT1(2);
    assert.deepEqual(seen, ['1/0', '2/10']);
    stop();
  });
});

describe('flattening', () => {
  test('mergeAll merges a changing set of events in fire order', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const set = cell<EventLike<string>[]>([a]);
    const r = record(mergeAll(set));
    a.fireT1('a1');
    set.putT1([a, b]);
    batch(() => { b.fireT1('b1'); a.fireT1('a2'); });
    set.putT1([b]);
    a.fireT1('a3');
    assert.deepEqual(r.seen, ['a1', 'b1', 'a2']);
    assert.equal(a.targets.size, 0);
    r.stop();
  });
});

// ---------------------------------------------------------------------------
// Randomized oracle for event nodes.
//
// A random graph of event and signal nodes, all observed for the whole run,
// is driven by random batches of fires and cell writes. A reference model
// computes each node's occurrences and value per round from scratch; each
// watched node's effect must agree and run at most once per round.

type Node =
  | { kind: 'src' }
  | { kind: 'cell' }
  | { kind: 'map'; e: number; k: number }
  | { kind: 'filter'; e: number; m: number }
  | { kind: 'alt'; a: number; b: number }
  | { kind: 'changes'; s: number }
  | { kind: 'attach'; s: number; e: number }
  | { kind: 'fold'; e: number }
  | { kind: 'stepper'; e: number }
  | { kind: 'take'; e: number; n: number }
  | { kind: 'withPrev'; e: number }
  | { kind: 'gate'; s: number; e: number }
  | { kind: 'zip'; a: number; b: number }
  | { kind: 'leftmost'; a: number; b: number }
  | { kind: 'mergeWith'; a: number; b: number }
  | { kind: 'sum'; ins: number[] };

const isEventKind = (n: Node) => ['src', 'map', 'filter', 'alt', 'changes', 'attach', 'take', 'withPrev', 'gate', 'zip', 'leftmost', 'mergeWith'].includes(n.kind);

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
}

const foldStep = (v: number, acc: number) => (acc * 31 + v + 1) % 1009;

function eventFuzz(seed: number, graphs = 60): { checks: number; bad: number; first?: string } {
  const rnd = lcg(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  let checks = 0;
  let bad = 0;
  let first: string | undefined;
  for (let g = 0; g < graphs; g++) {
    const spec: Node[] = [];
    const real: any[] = [];
    for (let i = 0; i < 3; i++) { spec.push({ kind: 'src' }); real.push(eventSource<number>()); }
    for (let i = 0; i < 2; i++) { spec.push({ kind: 'cell' }); real.push(cell(pick(4))); }
    const evs = () => spec.map((n, i) => (isEventKind(n) ? i : -1)).filter((i) => i >= 0);
    const sigs = () => spec.map((n, i) => (isEventKind(n) ? -1 : i)).filter((i) => i >= 0);
    for (let i = 0; i < 20; i++) {
      const r = rnd();
      const E = evs();
      const S = sigs();
      const e = () => E[pick(E.length)];
      const s = () => S[pick(S.length)];
      let n: Node;
      if (r < 0.15) n = { kind: 'map', e: e(), k: pick(5) };
      else if (r < 0.3) n = { kind: 'filter', e: e(), m: 2 + pick(2) };
      else if (r < 0.5) n = { kind: 'alt', a: e(), b: e() };
      else if (r < 0.6) n = { kind: 'changes', s: s() };
      else if (r < 0.7) n = { kind: 'attach', s: s(), e: e() };
      else if (r < 0.8) n = { kind: 'fold', e: e() };
      else if (r < 0.85) n = { kind: 'stepper', e: e() };
      else if (r < 0.9) n = { kind: 'sum', ins: [s(), s()] };
      else if (r < 0.94) n = { kind: 'take', e: e(), n: pick(6) };
      else if (r < 0.97) n = { kind: 'withPrev', e: e() };
      else if (r < 0.98) n = { kind: 'gate', s: s(), e: e() };
      else if (r < 0.99) n = { kind: 'zip', a: e(), b: e() };
      else if (r < 0.995) n = { kind: 'leftmost', a: e(), b: e() };
      else n = { kind: 'mergeWith', a: e(), b: e() };
      spec.push(n);
      switch (n.kind) {
        case 'map': { const k = n.k; real.push(mapEvent((x: number) => x + k, real[n.e])); break; }
        case 'filter': { const m = n.m; real.push(filterEvent((x: number) => x % m === 0, real[n.e])); break; }
        case 'alt': real.push(alt(real[n.a], real[n.b])); break;
        case 'changes': real.push(changes(real[n.s])); break;
        case 'attach': real.push(attachWith((b: number, a: number) => a * 10 + b, real[n.s], real[n.e])); break;
        case 'fold': real.push(foldEvent(foldStep, 0, real[n.e])); break;
        case 'stepper': real.push(stepper(0, real[n.e])); break;
        case 'sum': { const [x, y] = n.ins; real.push(derived(() => (real[x].read() + real[y].read()) % 7)); break; }
        case 'take': {
          const k = n.n;
          real.push(accumEvent((a: number, c: number) => (c < k ? { state: c + 1, emit: true, value: a } : { state: c, emit: false }), () => 0, real[n.e]));
          break;
        }
        case 'withPrev':
          real.push(accumEvent((a: number, p: number | null) => ({ state: a, emit: p !== null, value: p === null ? 0 : p * 100 + a }), () => null, real[n.e]));
          break;
        case 'gate': real.push(gate(derived(() => real[(n as any).s].read() % 2 === 0), real[n.e])); break;
        case 'zip': real.push(zip((x: number, y: number) => x * 10 + y, real[n.a], real[n.b])); break;
        case 'leftmost': real.push(leftmost([real[n.a], real[n.b]])); break;
        case 'mergeWith':
          real.push(mergeWith((x: number, y: number) => x * 10 + y, (x: number) => x, (y: number) => -y, real[n.a], real[n.b]));
          break;
      }
    }

    // Reference: signal values carried across rounds, occurrences per round.
    const value: number[] = spec.map((n, i) => (n.kind === 'cell' ? real[i].value : 0));
    const counter: number[] = spec.map(() => 0);
    const previous: (number | null)[] = spec.map(() => null);
    const queues: { a: number[]; b: number[] }[] = spec.map(() => ({ a: [], b: [] }));
    const evalRound = (fires: { src: number; v: number; s: number }[], writes: Map<number, number>, roundStamp: number, init = false) => {
      const occ: { s: number; v: number }[][] = [];
      const prev = value.slice();
      for (let i = 0; i < spec.length; i++) {
        const n = spec[i];
        occ[i] = [];
        switch (n.kind) {
          case 'src': occ[i] = fires.filter((f) => f.src === i).map((f) => ({ s: f.s, v: f.v })); break;
          case 'cell': if (writes.has(i)) value[i] = writes.get(i)!; break;
          case 'map': occ[i] = occ[n.e].map((o) => ({ s: o.s, v: o.v + n.k })); break;
          case 'filter': occ[i] = occ[n.e].filter((o) => o.v % n.m === 0); break;
          case 'alt': {
            const a = occ[n.a];
            const b = occ[n.b];
            const out = [];
            let x = 0;
            let y = 0;
            while (x < a.length && y < b.length) out.push(b[y].s < a[x].s ? b[y++] : a[x++]);
            occ[i] = out.concat(a.slice(x), b.slice(y));
            break;
          }
          case 'changes': if (!init && !Object.is(prev[n.s], value[n.s])) occ[i] = [{ s: roundStamp, v: value[n.s] }]; break;
          case 'attach': occ[i] = occ[n.e].map((o) => ({ s: o.s, v: o.v * 10 + value[n.s] })); break;
          case 'fold': for (const o of occ[n.e]) value[i] = foldStep(o.v, value[i]); break;
          case 'stepper': if (occ[n.e].length) value[i] = occ[n.e][occ[n.e].length - 1].v; break;
          case 'sum': value[i] = (value[n.ins[0]] + value[n.ins[1]]) % 7; break;
          case 'take':
            for (const o of occ[n.e]) if (counter[i] < n.n) { counter[i]++; occ[i].push(o); }
            break;
          case 'withPrev':
            for (const o of occ[n.e]) {
              if (previous[i] !== null) occ[i].push({ s: o.s, v: previous[i]! * 100 + o.v });
              previous[i] = o.v;
            }
            break;
          case 'gate': if (value[n.s] % 2 === 0) occ[i] = occ[n.e]; break;
          case 'zip': {
            const q = queues[i];
            const tagged = [...occ[n.a].map((o) => ({ o, side: 0 })), ...occ[n.b].map((o) => ({ o, side: 1 }))]
              .sort((x, y) => x.o.s - y.o.s || x.side - y.side);
            for (const { o, side } of tagged) {
              if (side === 0) { if (q.b.length) occ[i].push({ s: o.s, v: o.v * 10 + q.b.shift()! }); else q.a.push(o.v); }
              else if (q.a.length) occ[i].push({ s: o.s, v: q.a.shift()! * 10 + o.v }); else q.b.push(o.v);
            }
            break;
          }
          case 'leftmost': occ[i] = occ[n.a].length ? occ[n.a] : occ[n.b]; break;
          case 'mergeWith': {
            const as = occ[n.a];
            const bs = occ[n.b];
            let x = 0;
            let y = 0;
            while (x < as.length || y < bs.length) {
              if (y >= bs.length || (x < as.length && as[x].s < bs[y].s)) { occ[i].push({ s: as[x].s, v: as[x].v }); x++; }
              else if (x >= as.length || bs[y].s < as[x].s) { occ[i].push({ s: bs[y].s, v: -bs[y].v }); y++; }
              else { occ[i].push({ s: as[x].s, v: as[x].v * 10 + bs[y].v }); x++; y++; }
            }
            break;
          }
        }
      }
      return occ;
    };
    // Initial values of derived signals.
    evalRound([], new Map(), 0, true);

    const watched = spec.map((_, i) => i).filter((i) => i >= 5 && rnd() < 0.5);
    const got: Record<number, number[]> = {};
    const shown: Record<number, number> = {};
    const runs: Record<number, number> = {};
    const stop = scope((sc) => {
      for (const k of watched) {
        got[k] = [];
        if (isEventKind(spec[k])) {
          subscribeEvent(sc, real[k], (x: number) => { got[k].push(x); });
          effect(() => { touch(real[k]); runs[k] = (runs[k] || 0) + 1; });
        } else {
          effect(() => { shown[k] = real[k].read(); runs[k] = (runs[k] || 0) + 1; });
        }
      }
    });
    // Unwatched stateful nodes must still step while some watched node depends on them;
    // the reference steps every node, so keep the whole graph observed.
    const keep = scope(() => {
      for (let i = 5; i < spec.length; i++) {
        if (isEventKind(spec[i])) holdEvent(real[i]);
        else hold(real[i] as Readable<number>);
      }
    });

    let stampCounter = 0;
    for (let step = 0; step < 40; step++) {
      for (const k of watched) { got[k] = []; runs[k] = 0; }
      const fires: { src: number; v: number; s: number }[] = [];
      const writes = new Map<number, number>();
      const nOps = 1 + pick(4);
      for (let o = 0; o < nOps; o++) {
        if (rnd() < 0.7) fires.push({ src: pick(3), v: pick(4), s: ++stampCounter });
        else writes.set(3 + pick(2), pick(4));
      }
      batch(() => {
        for (const f of fires) real[f.src].fireT1(f.v);
        for (const [c, v] of writes) real[c].putT1(v);
      });
      const occ = evalRound(fires, writes, ++stampCounter + 1000000);
      for (const k of watched) {
        checks++;
        const ok = isEventKind(spec[k])
          ? JSON.stringify(got[k]) === JSON.stringify(occ[k].map((o) => o.v)) && runs[k] <= 1
          : shown[k] === value[k] && runs[k] <= 1;
        if (!ok) {
          bad++;
          if (!first) {
            const gotK = isEventKind(spec[k]) ? JSON.stringify(got[k]) : shown[k];
            const want = isEventKind(spec[k]) ? JSON.stringify(occ[k].map((o) => o.v)) : value[k];
            first = `seed ${seed} graph ${g} step ${step} node ${k} (${JSON.stringify(spec[k])}): got ${gotK} want ${want} runs ${runs[k]}`;
          }
        }
      }
    }
    stop();
    keep();
    if (real.some((n) => n.targets.size > 0)) {
      bad++;
      if (!first) first = `seed ${seed} graph ${g}: nodes still linked after stop`;
    }
  }
  return { checks, bad, first };
}

describe('randomized event oracle', () => {
  test('fixed seed', () => {
    const { checks, bad, first } = eventFuzz(11);
    assert.ok(checks > 500, `only ${checks} checks`);
    assert.equal(bad, 0, first);
  });

  test('random seed', () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { bad, first } = eventFuzz(seed);
    assert.equal(bad, 0, `fuzz failed with seed ${seed}: ${first}`);
  });
});

// ---------------------------------------------------------------------------
// Randomized oracle with stateful nodes and dynamic dependencies.
//
// The reference recomputes every value from scratch after each batch,
// starting from the observed roots, so it also knows which nodes are
// observed. A stateful node steps in a batch when it was observed before and
// after the batch and an input changed; a newly observed node resynchronizes
// without stepping.

type Spec =
  | { kind: 'sum'; ins: number[]; mod: boolean }
  | { kind: 'fold'; input: number }
  | { kind: 'merge'; left: number; right: number }
  | { kind: 'bind'; outer: number; branches: [number, number] };

function oracleFuzz(seed: number, graphs = 100): { checks: number; bad: number; first?: string } {
  const rnd = lcg(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  let bad = 0;
  let checks = 0;
  let first: string | undefined;
  const nCells = 5;
  for (let g = 0; g < graphs; g++) {
    const cells = Array.from({ length: nCells }, () => cell(pick(5)));
    const specs: Spec[] = [];
    const nodes: Readable<number>[] = [...cells];
    for (let i = 0; i < 25; i++) {
      const n = nodes.length;
      const r = rnd();
      let spec: Spec;
      if (r < 0.45) {
        const ins = nodes.map((_, j) => j).filter(() => rnd() < 0.2);
        if (!ins.length) ins.push(pick(n));
        spec = { kind: 'sum', ins, mod: rnd() < 0.3 };
      } else if (r < 0.65) {
        spec = { kind: 'fold', input: pick(n) };
      } else if (r < 0.8) {
        spec = { kind: 'merge', left: pick(n), right: pick(n) };
      } else {
        spec = { kind: 'bind', outer: pick(n), branches: [pick(n), pick(n)] };
      }
      specs.push(spec);
      switch (spec.kind) {
        case 'sum': {
          const { ins, mod } = spec;
          nodes.push(derived(() => {
            const s = ins.reduce((a, j) => a + nodes[j].read(), 0);
            return mod ? s % 3 : s;
          }));
          break;
        }
        case 'fold':
          nodes.push(fold(foldStep, 0, nodes[spec.input]));
          break;
        case 'merge':
          nodes.push(merge(nodes[spec.left], nodes[spec.right]));
          break;
        case 'bind': {
          const { outer, branches } = spec;
          nodes.push(bind(nodes[outer], (v) => nodes[branches[v % 2]]));
          break;
        }
      }
    }

    // Reference state. Versions follow the real nodes' rules: cells, derived
    // nodes and folds bump when their value changes; a merge bumps on every
    // step.
    const state: Record<number, number> = {};
    const lastIn: Record<number, number[]> = {};
    const refValue: Record<number, number> = {};
    const refVersion: Record<number, number> = {};
    let observedPrev = new Set<number>();

    const evaluate = (vals: number[]) => {
      const memo = new Map<number, number>();
      const observed = new Set<number>();
      const setValue = (k: number, v: number, always = false) => {
        if (always || !(k in refValue) || !Object.is(refValue[k], v)) {
          refValue[k] = v;
          refVersion[k] = (refVersion[k] || 0) + 1;
        }
      };
      const ev = (k: number): number => {
        if (memo.has(k)) return memo.get(k)!;
        observed.add(k);
        let v: number;
        if (k < nCells) {
          v = vals[k];
          setValue(k, v);
        } else {
          const spec = specs[k - nCells];
          switch (spec.kind) {
            case 'sum': {
              const s = spec.ins.reduce((a, j) => a + ev(j), 0);
              v = spec.mod ? s % 3 : s;
              setValue(k, v);
              break;
            }
            case 'bind':
              v = ev(spec.branches[ev(spec.outer) % 2]);
              setValue(k, v);
              break;
            case 'fold': {
              const x = ev(spec.input);
              const xv = refVersion[spec.input];
              if (!(k in state)) { state[k] = 0; setValue(k, 0); }
              if (observedPrev.has(k) && xv !== lastIn[k][0]) {
                state[k] = foldStep(x, state[k]);
                setValue(k, state[k]);
              }
              lastIn[k] = [xv];
              v = state[k];
              break;
            }
            case 'merge': {
              const a = ev(spec.left);
              const b = ev(spec.right);
              const av = refVersion[spec.left];
              const bv = refVersion[spec.right];
              if (!(k in state)) { state[k] = a; setValue(k, a); }
              if (observedPrev.has(k)) {
                const [la, lb] = lastIn[k];
                if (av !== la) { state[k] = a; setValue(k, a, true); }
                else if (bv !== lb) { state[k] = b; setValue(k, b, true); }
              }
              lastIn[k] = [av, bv];
              v = state[k];
              break;
            }
          }
        }
        memo.set(k, v);
        return v;
      };
      return { ev, observed };
    };

    const watched = nodes.map((_, i) => i).filter((i) => i >= nCells && rnd() < 0.4);
    const last: Record<number, number> = {};
    const runs: Record<number, number> = {};

    // Initial observation.
    {
      const { ev, observed } = evaluate(cells.map((c) => c.value));
      for (const k of watched) ev(k);
      observedPrev = observed;
    }
    const stop = scope(() => {
      for (const k of watched) effect(() => { last[k] = nodes[k].read(); runs[k] = (runs[k] || 0) + 1; });
    });

    for (let step = 0; step < 50; step++) {
      for (const k of watched) runs[k] = 0;
      // Write each chosen cell at most once per batch, so a value changes
      // exactly when its version does.
      const targets = [...new Set(Array.from({ length: 1 + pick(3) }, () => pick(nCells)))];
      batch(() => { for (const c of targets) cells[c].putT1(pick(5)); });
      const { ev, observed } = evaluate(cells.map((c) => c.value));
      for (const k of watched) {
        checks++;
        const expect = ev(k);
        if (last[k] !== expect || runs[k] > 1) {
          bad++;
          if (!first) first = `seed ${seed} graph ${g} step ${step} node ${k}: got ${last[k]} want ${expect} runs ${runs[k]}`;
        }
      }
      observedPrev = observed;
    }
    stop();
    if (cells.some((c) => c.targets.size)) {
      bad++;
      if (!first) first = `seed ${seed} graph ${g}: cells still linked after stop`;
    }
  }
  return { checks, bad, first };
}

describe('randomized oracle with stateful nodes and bind', () => {
  test('fixed seed', () => {
    const { checks, bad, first } = oracleFuzz(7);
    assert.ok(checks > 1000);
    assert.equal(bad, 0, first);
  });

  test('random seed', () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { bad, first } = oracleFuzz(seed);
    assert.equal(bad, 0, `fuzz failed with seed ${seed}: ${first}`);
  });
});
