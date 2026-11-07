import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cell, map, bind, stateful, hold, scope, effect, batch, stats,
  Readable,
} from '../../src/Screamer/Runtime.ts';

// A stateful signal that accumulates its input, one step per batch in which
// the input changed. The removed signal fold was this; PureScript code folds an
// event (`Event.fold f seed (Event.changes s)`), but these tests use it to
// exercise the stateful node itself.
const fold = <A, B>(f: (a: A, b: B) => B, seed: B, s: Readable<A>): Readable<B> =>
  stateful([s], () => seed, (_, values, b) => f(values[0], b));

describe('prototype checks', () => {
  test('6 fold steps only while observed, keeps its state, coalesces within a batch', () => {
    const clicks = cell(0);
    const count = fold((_: number, n: number) => n + 1, 0, clicks);
    const seen: number[] = [];
    let stop = scope(() => { effect(() => { seen.push(count.read()); }); });
    clicks.putT1(1);
    clicks.putT1(2);
    clicks.putT1(3);
    stop();
    clicks.putT1(4);
    clicks.putT1(5);
    assert.equal(count.read(), 3);
    stop = scope(() => { effect(() => { seen.push(count.read()); }); });
    batch(() => { clicks.putT1(6); clicks.putT1(7); });
    assert.equal(seen.join(' '), '0 1 2 3 3 4');
    stop();
  });

  test('6c two copies of the same fold observed together agree', () => {
    const c = cell(0);
    const mk = () => fold((v: number, acc: number) => acc + v, 0, c);
    const a = mk();
    const b = mk();
    const seen: boolean[] = [];
    const stop = scope(() => { effect(() => { seen.push(a.read() === b.read()); }); });
    c.putT1(2);
    c.putT1(5);
    assert.equal(seen.length, 3);
    assert.ok(seen.every(Boolean));
    stop();
  });
});

describe('hold', () => {
  test('keeps a fold advancing while no view reads it, and stops with its scope', () => {
    const clicks = cell(0);
    const count = fold((_: number, n: number) => n + 1, 0, clicks);
    const stop = scope(() => { hold(count); });
    clicks.putT1(1);
    clicks.putT1(2);
    assert.equal(count.read(), 2);
    stop();
    clicks.putT1(3);
    assert.equal(count.read(), 2);
    assert.equal(clicks.targets.size, 0);
  });

  test('returns the same node', () => {
    const c = cell(0);
    const f = fold((v: number, acc: number) => acc + v, 0, c);
    let held: Readable<number> | null = null;
    const stop = scope(() => { held = hold(f); });
    assert.equal(held, f);
    stop();
  });
});

describe('stateful nodes in the graph', () => {
  test('a fold under a derived node pauses when the derived node is unobserved', () => {
    const c = cell(0);
    const count = fold((_: number, n: number) => n + 1, 0, c);
    const doubled = map((n: number) => n * 2, count);
    const seen: number[] = [];
    let stop = scope(() => { effect(() => { seen.push(doubled.read()); }); });
    c.putT1(1);
    stop();
    c.putT1(2);
    stop = scope(() => { effect(() => { seen.push(doubled.read()); }); });
    c.putT1(3);
    assert.deepEqual(seen, [0, 2, 2, 4]);
    stop();
    assert.equal(c.targets.size, 0);
  });

  test('bind keeps an inner fold while the outer value stays put', () => {
    const which = cell(0);
    const clicks = cell(0);
    const s = bind(which, () => fold((_: number, n: number) => n + 1, 0, clicks));
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(s.read()); }); });
    clicks.putT1(1);
    clicks.putT1(2);
    which.putT1(1);
    clicks.putT1(3);
    assert.deepEqual(seen, [0, 1, 2, 0, 1]);
    stop();
  });

  test('a throwing step leaves the node retrying', () => {
    const c = cell(0);
    const f = fold((v: number, acc: number) => { if (v < 0) throw new Error('negative'); return acc + v; }, 0, c);
    const errors: unknown[] = [];
    const seen: number[] = [];
    const stop = scope((s) => {
      s.onError = (e) => { errors.push(e); };
      effect(() => { seen.push(f.read()); });
    });
    c.putT1(2);
    c.putT1(-1);
    c.putT1(3);
    assert.equal(errors.length, 1);
    assert.deepEqual(seen, [0, 2, 5]);
    stop();
  });

  test('step counter only advances while observed', () => {
    const c = cell(0);
    const f = fold((v: number, acc: number) => acc + v, 0, c);
    const before = stats.steps;
    for (let i = 1; i <= 10; i++) c.putT1(i);
    assert.equal(stats.steps - before, 0);
    assert.equal(f.read(), 0);
  });
});

