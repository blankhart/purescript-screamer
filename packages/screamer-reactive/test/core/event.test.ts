import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cell, derived, map, scope, effect, batch, stats, hold,
  eventSource, mapEvent, filterEvent, alt, neverEvent, changes, stepper, foldEvent, attachWith,
  subscribeEvent, holdEvent, EventLike, touch, accumEvent, switchEvent,
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
});

