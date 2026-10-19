import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cell, derived, map, scope, effect, batch, stats, hold, Readable,
  eventSource, mapEvent, filterEvent, alt, neverEvent, changes, stepper, foldEvent, attachWith,
  subscribeEvent, holdEvent, EventLike, touch, accumEvent, gate,
  oneOf, leftmost, mergeWith, zip, race, combine, withLatest, switchEvent, mergeAll,
} from '../../src/Screamer/Runtime.ts';

/** Record each occurrence of `e` until stopped. */
function record<A>(e: EventLike<A>) {
  const seen: A[] = [];
  const stop = scope((s) => { subscribeEvent(s, e, (a) => { seen.push(a); }); });
  return { seen, stop };
}

describe('event sources', () => {
  test('two fires of the same value in one batch both reach a fold', () => {
    const src = eventSource<number>();
    const count = foldEvent((_: number, n: number) => n + 1, 0, src);
    const sums = foldEvent((x: number, n: number) => n + x, 0, src);
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(count.read() * 100 + sums.read()); }); });
    batch(() => { src.fire(1); src.fire(1); });
    src.fire(1);
    assert.deepEqual(seen, [0, 202, 303]);
    stop();
  });

  test('a subscriber gets every occurrence in order, in one effect run per round', () => {
    const src = eventSource<string>();
    const seen: string[] = [];
    let runs = 0;
    const stop = scope((s) => {
      subscribeEvent(s, src, (x) => { seen.push(x); });
      effect(() => { touch(src); runs++; });
    });
    batch(() => { src.fire('a'); src.fire('a'); src.fire('b'); });
    assert.deepEqual(seen, ['a', 'a', 'b']);
    assert.equal(runs, 2);
    stop();
  });

  test('occurrences fired while nothing observes the event go nowhere', () => {
    const src = eventSource<number>();
    src.fire(1);
    const seen: number[] = [];
    const stop = scope((s) => { subscribeEvent(s, src, (x) => { seen.push(x); }); });
    src.fire(2);
    assert.deepEqual(seen, [2]);
    stop();
  });

  test('a fire from a subscriber callback is delivered in the next round', () => {
    const a = eventSource<number>();
    const b = eventSource<number>();
    const seen: string[] = [];
    const stop = scope((s) => {
      subscribeEvent(s, a, (x) => { seen.push(`a${x}`); b.fire(x + 1); });
      subscribeEvent(s, b, (x) => { seen.push(`b${x}`); });
    });
    a.fire(1);
    assert.deepEqual(seen, ['a1', 'b2']);
    stop();
  });

  test('a fire inside a derivation throws in development', () => {
    const src = eventSource<number>();
    const c = cell(0);
    const bad = derived(() => { src.fire(c.read()); return 0; });
    assert.throws(() => bad.read(), /fire inside a derivation/);
  });
});

describe('combinators', () => {
  test('<|> delivers both inputs in fire order and loses nothing', () => {
    const a = eventSource<string>();
    const b = eventSource<string>();
    const both = alt(a, b);
    const r = record(both);
    batch(() => { b.fire('b1'); a.fire('a1'); b.fire('b2'); a.fire('a2'); });
    assert.deepEqual(r.seen, ['b1', 'a1', 'b2', 'a2']);
    r.stop();
  });

  test('<|> of two maps of one event puts the left first', () => {
    const src = eventSource<number>();
    const r = record(alt(mapEvent((x: number) => `L${x}`, src), mapEvent((x: number) => `R${x}`, src)));
    batch(() => { src.fire(1); src.fire(2); });
    assert.deepEqual(r.seen, ['L1', 'R1', 'L2', 'R2']);
    r.stop();
  });

  test('never is the identity of <|>', () => {
    const src = eventSource<number>();
    assert.equal(alt(src, neverEvent), src);
    assert.equal(alt(neverEvent, src), src);
  });

  test('filter keeps the occurrences that satisfy the predicate', () => {
    const src = eventSource<number>();
    const r = record(filterEvent((x: number) => x % 2 === 0, src));
    batch(() => { for (const x of [1, 2, 3, 4]) src.fire(x); });
    src.fire(5);
    src.fire(6);
    assert.deepEqual(r.seen, [2, 4, 6]);
    r.stop();
  });

  test('changes fires once per round with the final value, after the round\'s fires', () => {
    const c = cell(0);
    const src = eventSource<number>();
    const r = record(alt(changes(c), mapEvent((x: number) => -x, src)));
    batch(() => { c.write(1); c.write(2); src.fire(7); });
    c.write(2);
    c.write(3);
    assert.deepEqual(r.seen, [-7, 2, 3]);
    r.stop();
  });

  test('attachWith reads the signal at the end of the round', () => {
    const s = cell('x');
    const src = eventSource<number>();
    const r = record(attachWith((b: string, a: number) => `${b}${a}`, s, src));
    batch(() => { src.fire(1); s.write('y'); src.fire(2); });
    src.fire(3);
    assert.deepEqual(r.seen, ['y1', 'y2', 'y3']);
    r.stop();
  });

  test('stepper takes the last occurrence of the round', () => {
    const src = eventSource<number>();
    const latest = stepper(0, src);
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(latest.read()); }); });
    batch(() => { src.fire(1); src.fire(2); });
    src.fire(3);
    assert.deepEqual(seen, [0, 2, 3]);
    stop();
  });
});

describe('observation', () => {
  test('stepper and fold pause, keep their state and miss occurrences while paused', () => {
    const src = eventSource<number>();
    const latest = stepper(0, src);
    const total = foldEvent((x: number, n: number) => n + x, 0, src);
    let stop = scope(() => { effect(() => { latest.read(); total.read(); }); });
    src.fire(1);
    src.fire(2);
    stop();
    src.fire(10);
    assert.equal(latest.read(), 2);
    assert.equal(total.read(), 3);
    stop = scope(() => { effect(() => { latest.read(); total.read(); }); });
    assert.equal(total.read(), 3);
    src.fire(4);
    assert.equal(latest.read(), 4);
    assert.equal(total.read(), 7);
    stop();
  });

  test('a re-observed event does not deliver occurrences from before', () => {
    const src = eventSource<number>();
    const doubled = mapEvent((x: number) => x * 2, src);
    let r = record(doubled);
    src.fire(1);
    r.stop();
    // Keep the source observed elsewhere, so it fires while `doubled` is not.
    const keep = record(src);
    src.fire(2);
    r = record(doubled);
    assert.deepEqual(r.seen, []);
    src.fire(3);
    assert.deepEqual(r.seen, [6]);
    r.stop();
    keep.stop();
  });

  test('a stateful node over events steps in its round even when nothing reads it then', () => {
    const src = eventSource<number>();
    const gate = cell(false);
    const total = foldEvent((x: number, n: number) => n + x, 0, src);
    const shown = derived(() => (gate.read() ? total.read() : -1));
    const stop = scope(() => { hold(total); effect(() => { shown.read(); }); });
    src.fire(1);
    src.fire(2);
    gate.write(true);
    assert.equal(shown.read(), 3);
    stop();
  });

  test('unobserved events hold no links, and disposing the subscriber releases them', () => {
    const before = stats.links;
    const src = eventSource<number>();
    const c = cell(1);
    const e = alt(attachWith((b: number, a: number) => a + b, c, src), mapEvent((x: number) => x, changes(c)));
    const count = foldEvent((_: number, n: number) => n + 1, 0, e);
    const shown = map((n: number) => n * 2, count);
    assert.equal(stats.links, before);
    const stop = scope((s) => {
      subscribeEvent(s, e, () => {});
      effect(() => { shown.read(); });
    });
    assert.ok(stats.links > before);
    src.fire(1);
    c.write(2);
    stop();
    assert.equal(stats.links, before);
    assert.equal(src.targets.size, 0);
    assert.equal(c.targets.size, 0);
  });

  test('holdEvent keeps an event observed for the scope, so its stateful consumers advance', () => {
    const src = eventSource<number>();
    const stop = scope(() => { holdEvent(src); });
    assert.equal(src.targets.size, 1);
    stop();
    assert.equal(src.targets.size, 0);
  });

  test('an error in a subscriber callback is reported and the other occurrences still arrive', () => {
    const src = eventSource<number>();
    const seen: number[] = [];
    const errors: unknown[] = [];
    const stop = scope((s) => {
      s.onError = (e) => { errors.push(e); };
      subscribeEvent(s, src, (x) => { if (x === 2) throw new Error('two'); seen.push(x); });
    });
    batch(() => { src.fire(1); src.fire(2); src.fire(3); });
    assert.deepEqual(seen, [1, 3]);
    assert.equal(errors.length, 1);
    stop();
  });
});

describe('stateful event nodes', () => {
  const take = <A>(n: number, e: EventLike<A>) =>
    accumEvent((a: A, k: number) => (k < n ? { state: k + 1, emit: true, value: a } : { state: k, emit: false }), () => 0, e);

  test('accumEvent steps once per occurrence and keeps stamps', () => {
    const a = eventSource<number>();
    const b = eventSource<number>();
    const r = record(alt(take(2, a), b));
    batch(() => { b.fire(10); a.fire(1); a.fire(2); b.fire(20); a.fire(3); });
    assert.deepEqual(r.seen, [10, 1, 2, 20]);
    r.stop();
  });

  test('take counts only occurrences seen while observed and does not restart', () => {
    const src = eventSource<number>();
    const first2 = take(2, src);
    const keep = record(src);
    let r = record(first2);
    src.fire(1);
    r.stop();
    src.fire(2);
    src.fire(3);
    r = record(first2);
    src.fire(4);
    src.fire(5);
    assert.deepEqual(r.seen, [4]);
    r.stop();
    keep.stop();
  });

  test('a stateful event node holds no links once unobserved', () => {
    const before = stats.links;
    const src = eventSource<number>();
    const r = record(take(3, src));
    src.fire(1);
    r.stop();
    assert.equal(stats.links, before);
  });

  test('gate passes the occurrences of rounds that end with the condition true', () => {
    const open = cell(false);
    const src = eventSource<number>();
    const r = record(gate(open, src));
    src.fire(1);
    batch(() => { src.fire(2); open.write(true); });
    src.fire(3);
    batch(() => { src.fire(4); open.write(false); });
    assert.deepEqual(r.seen, [2, 3]);
    r.stop();
  });
});

describe('combining', () => {
  const pair = (a: unknown, b: unknown) => `${a}${b}`;

  test('oneOf interleaves every input by fire order', () => {
    const [a, b, c] = [eventSource<string>(), eventSource<string>(), eventSource<string>()];
    const r = record(oneOf([a, b, c]));
    batch(() => { c.fire('c1'); a.fire('a1'); b.fire('b1'); c.fire('c2'); });
    assert.deepEqual(r.seen, ['c1', 'a1', 'b1', 'c2']);
    r.stop();
  });

  test('leftmost keeps the leftmost input that fired in the round', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const r = record(leftmost([a, b]));
    batch(() => { b.fire('b1'); a.fire('a1'); a.fire('a2'); });
    b.fire('b2');
    assert.deepEqual(r.seen, ['a1', 'a2', 'b2']);
    r.stop();
  });

  test('mergeWith combines occurrences of one fire and loses nothing', () => {
    const src = eventSource<number>();
    const other = eventSource<number>();
    const e = mergeWith((x: number, y: number) => `both${x},${y}`, (x: number) => `L${x}`, (y: number) => `R${y}`,
      mapEvent((x: number) => x, src), alt(mapEvent((x: number) => -x, src), other));
    const r = record(e);
    batch(() => { src.fire(1); other.fire(9); src.fire(2); });
    assert.deepEqual(r.seen, ['both1,-1', 'R9', 'both2,-2']);
    r.stop();
  });

  test('zip pairs the nth with the nth, across rounds and within one', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const r = record(zip(pair, a, b));
    batch(() => { a.fire('a1'); a.fire('a2'); b.fire('b1'); });
    b.fire('b2');
    b.fire('b3');
    a.fire('a3');
    assert.deepEqual(r.seen, ['a1b1', 'a2b2', 'a3b3']);
    r.stop();
  });

  test('zip drops its queues when unobserved', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const z = zip(pair, a, b);
    const keep = scope(() => { holdEvent(a); holdEvent(b); });
    let r = record(z);
    a.fire('a1');
    a.fire('a2');
    r.stop();
    r = record(z);
    b.fire('b1');
    a.fire('a3');
    assert.deepEqual(r.seen, ['a3b1']);
    r.stop();
    keep();
  });

  test('race follows the first input to fire, the leftmost on a tie', () => {
    const [a, b, c] = [eventSource<string>(), eventSource<string>(), eventSource<string>()];
    const r = record(race([a, b, c]));
    batch(() => { c.fire('c1'); b.fire('b1'); });
    a.fire('a1');
    b.fire('b2');
    assert.deepEqual(r.seen, ['b1', 'b2']);
    r.stop();
  });

  test('combine is one node over every signal', () => {
    const cs = [cell(1), cell(2), cell(3)];
    const all = combine(cs);
    const seen: string[] = [];
    let runs = 0;
    const stop = scope(() => { effect(() => { seen.push(all.read().join()); runs++; }); });
    batch(() => { cs[0].write(4); cs[2].write(6); });
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
    src.fire(5);
    src.fire(5);
    a.write(2);
    assert.deepEqual(seen, ['1/0', '2/10']);
    stop();
  });
});

describe('flattening', () => {
  test('switchEvent follows the event the signal holds and releases the old one', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const which = cell<EventLike<string>>(a);
    const r = record(switchEvent(which));
    a.fire('a1');
    b.fire('b1');
    which.write(b);
    a.fire('a2');
    b.fire('b2');
    assert.deepEqual(r.seen, ['a1', 'b2']);
    assert.equal(a.targets.size, 0);
    r.stop();
    assert.equal(b.targets.size, 0);
    assert.equal(which.targets.size, 0);
  });

  test('switching in the same batch as a fire delivers the new event from the next round', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const which = cell<EventLike<string>>(a);
    const keep = scope(() => { holdEvent(b); });
    const r = record(switchEvent(which));
    batch(() => { which.write(b); b.fire('b1'); a.fire('a1'); });
    b.fire('b2');
    assert.deepEqual(r.seen, ['b2']);
    r.stop();
    keep();
  });

  test('mergeAll merges a changing set of events in fire order', () => {
    const [a, b] = [eventSource<string>(), eventSource<string>()];
    const set = cell<EventLike<string>[]>([a]);
    const r = record(mergeAll(set));
    a.fire('a1');
    set.write([a, b]);
    batch(() => { b.fire('b1'); a.fire('a2'); });
    set.write([b]);
    a.fire('a3');
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

export function eventFuzz(seed: number, graphs = 60): { checks: number; bad: number; first?: string } {
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
        for (const f of fires) real[f.src].fire(f.v);
        for (const [c, v] of writes) real[c].write(v);
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
