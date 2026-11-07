import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cell, stateful, scope, effect, sample, map, stepper, eventSource, untracked, batch } from '../../src/Screamer/Runtime.ts';

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

  describe('writes from two subscribers in one timestep (#72)', () => {
    /** Two subscribers to `a` that each run `w` with their own argument when `a` turns positive. */
    function twoWriters(w: (x: number) => void): () => void {
      const a = cell(0);
      const stop = scope(() => {
        effect(() => { if (a.read() > 0) untracked(() => w(1)); });
        effect(() => { if (a.read() > 0) untracked(() => w(2)); });
      });
      a.putT1(1);
      return stop;
    }

    test('two subscribers writing different values to one source warn once', () => {
      const c = cell(0);
      const seen = warnings(() => {
        const stop = twoWriters((x) => c.putT1(x));
        stop();
      });
      assert.equal(seen.length, 1);
      assert.match(seen[0], /one signal source was written by two subscribers/);
      assert.equal(c.read(), 2);
    });

    test('two modifies from two subscribers warn', () => {
      const c = cell(1);
      const seen = warnings(() => { twoWriters((x) => c.modifyT1((n) => n * 10 + x))(); });
      assert.equal(seen.length, 1);
    });

    test('equal values, one subscriber writing twice, and commuting sources do not warn', () => {
      const same = cell(0);
      const once = cell(0);
      const counter = cell(0);
      counter.commutes = true;
      const seen = warnings(() => {
        twoWriters(() => same.putT1(7))();
        twoWriters((x) => { if (x === 1) { once.putT1(1); once.putT1(2); } })();
        twoWriters((x) => counter.modifyT1((n) => n + x))();
      });
      assert.deepEqual(seen, []);
      assert.equal(counter.read(), 3);
    });

    test('writes in one event handler batch, and setup code with its own subscriber, do not warn', () => {
      const c = cell(0);
      const seen = warnings(() => {
        batch(() => { c.putT1(1); c.putT1(2); });
        const stop = scope(() => {
          c.putT1(3);
          effect(() => { untracked(() => c.putT1(4)); });
        });
        stop();
      });
      assert.deepEqual(seen, []);
      assert.equal(c.read(), 4);
    });

    test('two components mounted in one timestep writing one source warn', () => {
      const a = cell(0);
      const c = cell(0);
      const seen = warnings(() => {
        const stop = scope(() => {
          effect(() => {
            if (a.read() > 0) {
              untracked(() => {
                scope(() => { c.putT1(1); });
                scope(() => { c.putT1(2); });
              });
            }
          });
        });
        a.putT1(1);
        stop();
      });
      assert.equal(seen.length, 1);
    });

    test('two subscribers firing one event source warn, unless it commutes', () => {
      const src = eventSource<number>();
      const quiet = eventSource<number>();
      quiet.commutes = true;
      const seen = warnings(() => {
        const keep = scope(() => {
          const last = stepper(0, src);
          const lastQuiet = stepper(0, quiet);
          effect(() => { last.read(); lastQuiet.read(); });
        });
        twoWriters((x) => { src.fireT1(x); quiet.fireT1(x); })();
        keep();
      });
      assert.equal(seen.length, 1);
      assert.match(seen[0], /one event source was fired by two subscribers/);
    });
  });

  test('a write inside a derivation is an error in development', () => {
    const a = cell(1);
    const b = cell(0);
    assert.throws(() => map((x: number) => { b.putT1(x); return x; }, a).read(), /write inside a derivation/);
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
      assert.doesNotThrow(() => R.map((x: number) => { b.putT1(x); return x; }, a).read());
    } finally {
      delete (globalThis as any).__DEV__;
    }
  });
});
