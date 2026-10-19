import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cell, stateful, scope, effect, sample, map, stepper, eventSource } from '../../src/Screamer/Runtime.ts';

/** Run `f`, returning the messages it passed to `console.warn`. */
function warnings(f: () => void): string[] {
  const seen: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { seen.push(args.map(String).join(' ')); };
  try {
    f();
  } finally {
    console.warn = warn;
  }
  return seen;
}

describe('development warnings', () => {
  test('a read of a paused stateful node warns once, naming the operator', () => {
    const src = eventSource<number>();
    const last = stepper(0, src);
    const stop = scope(() => { effect(() => { last.read(); }); });
    stop();
    const seen = warnings(() => {
      sample(last);
      sample(last);
    });
    assert.equal(seen.length, 1);
    assert.match(seen[0], /paused stateful signal \(Event\.stepper\)/);
  });

  test('observed, never-observed and tracked reads do not warn', () => {
    const a = cell(1);
    const s = stateful([a], () => a.value, (_, values) => values[0]);
    const seen = warnings(() => {
      sample(s); // never observed: it starts at its seed
      const stop = scope(() => { effect(() => { s.read(); }); });
      sample(s); // observed
      stop();
      // A computation reading it is about to observe it again.
      const again = scope(() => { effect(() => { map((x: number) => x, s).read(); }); });
      again();
    });
    assert.deepEqual(seen, []);
  });

  test('a write inside a derivation is an error in development', () => {
    const a = cell(1);
    const b = cell(0);
    assert.throws(() => map((x: number) => { b.write(x); return x; }, a).read(), /write inside a derivation/);
  });

  test('with __DEV__ false nothing warns', async () => {
    (globalThis as any).__DEV__ = false;
    try {
      const R = await import('../../src/Screamer/Runtime.ts?production');
      assert.equal(R.DEV, false);
      const src = R.eventSource<number>();
      const last = R.stepper(0, src);
      const stop = R.scope(() => { R.effect(() => { last.read(); }); });
      stop();
      assert.deepEqual(warnings(() => { R.sample(last); }), []);
      // The write guard is off too.
      const a = R.cell(1);
      const b = R.cell(0);
      assert.doesNotThrow(() => R.map((x: number) => { b.write(x); return x; }, a).read());
    } finally {
      delete (globalThis as any).__DEV__;
    }
  });
});
