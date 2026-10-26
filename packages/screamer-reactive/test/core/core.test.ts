import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cell, derived, map, bind, dropRepeatsBy, scope, effect, batch, sample, untracked, stats, createScope, runInScope,
  eventSource, subscribeEvent,
  Readable,
} from '../../src/Screamer/Runtime.ts';

const gc = (globalThis as any).gc as () => void;

describe('prototype checks', () => {
  test('1 escaped derived signal stays live after its creator is disposed', () => {
    const src = cell(1);
    let esc!: Readable<number>;
    const stop = scope(() => {
      effect(() => {
        esc = map((x: number) => x * 10, src);
        esc.read();
      });
    });
    stop();
    src.putT1(2);
    assert.equal(esc.read(), 20);
  });

  test('2 unobserved derivations attach nothing', () => {
    const app = cell(0);
    for (let i = 0; i < 1000; i++) map((x: number) => x + 1, app).read();
    assert.equal(app.targets.size, 0);
    const d = scope(() => {
      for (let i = 0; i < 1000; i++) {
        const c = map((x: number) => x + 1, app);
        effect(() => { c.read(); });
      }
    });
    assert.equal(app.targets.size, 1000);
    d();
    assert.equal(app.targets.size, 0);
  });

  test('3 diamond is glitch-free, one effect run per write', () => {
    const a = cell(1);
    const l = map((x: number) => x + 1, a);
    const r = map((x: number) => x * 2, a);
    const seen: string[] = [];
    scope(() => { effect(() => { seen.push(`${l.read()}/${r.read()}`); }); });
    a.putT1(5);
    assert.equal(seen.join(' '), '2/2 6/10');
  });

  test('4 cutoff on equal writes; a derived node updates whenever an input does (#68)', () => {
    const a = cell(1);
    const parity = map((x: number) => x % 2, a);
    let runs = 0;
    scope(() => { effect(() => { parity.read(); runs++; }); });
    a.putT1(1);
    assert.equal(runs, 1);
    a.putT1(3);
    assert.equal(runs, 2);
  });

  test('4b dropRepeatsBy is the cutoff, with its equivalence', () => {
    const a = cell({ n: 1 });
    const d = dropRepeatsBy((x, y) => x.n === y.n, derived(() => ({ n: a.read().n })));
    let runs = 0;
    scope(() => { effect(() => { d.read(); runs++; }); });
    a.putT1({ n: 1 });
    assert.equal(runs, 1);
    a.putT1({ n: 2 });
    assert.equal(runs, 2);
  });

  test('5 monadic bind unlinks the branch no longer read', () => {
    const which = cell(true);
    const x = cell('x0');
    const y = cell('y0');
    const seen: string[] = [];
    const s = bind(which, (w) => (w ? x : y));
    scope(() => { effect(() => { seen.push(s.read()); }); });
    which.putT1(false);
    x.putT1('x1');
    y.putT1('y1');
    assert.equal(seen.join(' '), 'x0 y0 y1');
    assert.equal(x.targets.size, 0);
  });

  test('10 mount and unmount 1000 times leaves nothing live', () => {
    const app = cell(0);
    const before = stats.liveEffects;
    const scopesBefore = stats.liveScopes;
    for (let i = 0; i < 1000; i++) {
      scope(() => {
        const d = map((x: number) => x * 2, app);
        effect(() => { d.read(); });
        effect(() => { app.read(); });
      })();
    }
    assert.equal(stats.liveEffects - before, 0);
    assert.equal(stats.liveScopes - scopesBefore, 0);
    assert.equal(app.targets.size, 0);
  });

  test('11 writes inside a derivation are rejected', () => {
    const a = cell(0);
    const b = cell(0);
    assert.throws(() => map((x: number) => { b.putT1(x); return x; }, a).read(), /write inside a derivation/);
  });

  test('12a effect writes propagate in a later round', () => {
    const a = cell(0);
    const b = cell(0);
    const seen: number[] = [];
    scope(() => {
      effect(() => { b.putT1(a.read() * 2); });
      effect(() => { seen.push(b.read()); });
    });
    a.putT1(1);
    assert.equal(seen.join(' '), '0 2');
  });

  test('12b a self-loop is caught', () => {
    const c = cell(0);
    // The first run's write is deferred to the next round, where the effect
    // is linked, so the loop shows up as soon as the scope is set up.
    const s = createScope(null);
    assert.throws(() => batch(() => runInScope(s, () => { effect(() => { c.putT1(c.read() + 1); }); })), /effect loop/);
    s.dispose();
  });
});

describe('regressions from the previous runtime', () => {
  test('a derived signal does not go stale after its creator re-runs', () => {
    const src = cell(1);
    const trigger = cell(0);
    let made: Readable<number> | null = null;
    const stop = scope(() => {
      effect(() => {
        trigger.read();
        if (made === null) made = map((x: number) => x + 1, src);
      });
    });
    trigger.putT1(1);
    src.putT1(5);
    assert.equal(made!.read(), 6);
    const seen: number[] = [];
    const stop2 = scope(() => { effect(() => { seen.push(made!.read()); }); });
    src.putT1(7);
    assert.deepEqual(seen, [6, 8]);
    stop();
    stop2();
  });

  test('observers are released: 1000 creations leave 0 links', () => {
    const src = cell(0);
    const linksBefore = stats.links;
    for (let i = 0; i < 1000; i++) {
      const d = map((x: number) => x + i, src);
      scope(() => { effect(() => { d.read(); }); })();
    }
    assert.equal(src.targets.size, 0);
    assert.equal(stats.links - linksBefore, 0);
  });

  test('a merge written by two effects keeps listening after its parent re-runs', () => {
    const a = cell('a0');
    const b = cell('b0');
    const t = cell(0);
    const merged = cell('a0');
    let inner: (() => void) | null = null;
    // Effects run without an owner, so the child scope names its parent.
    const stop = scope((outer) => {
      effect(() => {
        t.read();
        if (inner) inner();
        inner = scope(() => {
          effect(() => { merged.putT1(a.read()); });
          effect(() => { merged.putT1(b.read()); });
        }, outer);
      });
    });
    t.putT1(1);
    b.putT1('b1');
    assert.equal(merged.read(), 'b1');
    a.putT1('a1');
    assert.equal(merged.read(), 'a1');
    stop();
    assert.equal(a.targets.size + b.targets.size + t.targets.size, 0);
  });
});

describe('garbage collection', () => {
  test('an unobserved derived node is collected', async () => {
    const app = cell(0);
    let ref!: WeakRef<object>;
    (() => {
      const c = map((x: number) => x, app);
      c.read();
      ref = new WeakRef(c);
    })();
    for (let i = 0; i < 5 && ref.deref() !== undefined; i++) {
      await new Promise((r) => setTimeout(r, 0));
      gc();
    }
    assert.equal(ref.deref(), undefined);
  });

  test('a derived node is collected after its observer is disposed', async () => {
    const app = cell(0);
    let ref!: WeakRef<object>;
    let stop!: () => void;
    (() => {
      const c = map((x: number) => x, app);
      stop = scope(() => { effect(() => { c.read(); }); });
      ref = new WeakRef(c);
    })();
    stop();
    for (let i = 0; i < 5 && ref.deref() !== undefined; i++) {
      await new Promise((r) => setTimeout(r, 0));
      gc();
    }
    assert.equal(ref.deref(), undefined);
  });
});

describe('exceptions', () => {
  test('a throwing derivation stays dirty and recovers', () => {
    const a = cell(1);
    const d = map((x: number) => { if (x < 0) throw new Error('negative'); return x * 2; }, a);
    const seen: (number | string)[] = [];
    const errors: unknown[] = [];
    const s = createScope(null);
    s.onError = (e) => { errors.push(e); seen.push('error'); };
    runInScope(s, () => effect(() => { seen.push(d.read()); }));
    a.putT1(-1);
    assert.equal(errors.length, 1);
    assert.throws(() => d.read(), /negative/);
    a.putT1(3);
    assert.deepEqual(seen, [2, 'error', 6]);
    s.dispose();
    assert.equal(a.targets.size, 0);
  });

  test('a derivation that throws on first observation still hears its sources', () => {
    const a = cell(-1);
    const d = map((x: number) => { if (x < 0) throw new Error('negative'); return x; }, a);
    const seen: (number | string)[] = [];
    const s = createScope(null);
    s.onError = () => { seen.push('error'); };
    runInScope(s, () => effect(() => { seen.push(d.read()); }));
    a.putT1(4);
    assert.deepEqual(seen, ['error', 4]);
    s.dispose();
    assert.equal(a.targets.size, 0);
  });

  test('a throwing effect is reported and does not stop the flush', () => {
    const a = cell(0);
    const seen: number[] = [];
    const s = createScope(null);
    const errors: unknown[] = [];
    s.onError = (e) => { errors.push(e); };
    runInScope(s, () => {
      effect(() => { if (a.read() === 1) throw new Error('boom'); });
      effect(() => { seen.push(a.read()); });
    });
    a.putT1(1);
    a.putT1(2);
    assert.deepEqual(seen, [0, 1, 2]);
    assert.equal(errors.length, 1);
    s.dispose();
  });

  test('without a handler the error is rethrown after the flush completes', () => {
    const a = cell(0);
    const seen: number[] = [];
    const stop = scope(() => {
      effect(() => { if (a.read() === 1) throw new Error('boom'); });
      effect(() => { seen.push(a.read()); });
    });
    assert.throws(() => a.putT1(1), /boom/);
    assert.deepEqual(seen, [0, 1]);
    a.putT1(2);
    assert.deepEqual(seen, [0, 1, 2]);
    stop();
  });

  test('a derived cycle throws', () => {
    let b!: Readable<number>;
    const a = derived(() => b.read() + 1);
    b = derived(() => a.read() + 1);
    assert.throws(() => a.read(), /cycle/);
  });
});

describe('misc', () => {
  test('an unobserved derived node read twice in one epoch computes once', () => {
    const a = cell(1);
    let runs = 0;
    const d = derived(() => { runs++; return a.read(); });
    d.read();
    d.read();
    assert.equal(runs, 1);
    a.putT1(2);
    d.read();
    d.read();
    assert.equal(runs, 2);
  });

  test('sample does not record a dependency', () => {
    const a = cell(1);
    const b = cell(10);
    const seen: number[] = [];
    scope(() => { effect(() => { seen.push(a.read() + sample(b)); }); });
    b.putT1(20);
    a.putT1(2);
    assert.deepEqual(seen, [11, 22]);
  });

  test('two writes in one batch run an effect once', () => {
    const a = cell(1);
    const b = cell(2);
    const seen: number[] = [];
    scope(() => { effect(() => { seen.push(a.read() + b.read()); }); });
    batch(() => { a.putT1(10); b.putT1(20); });
    assert.deepEqual(seen, [3, 30]);
  });

  test('effects run in creation order', () => {
    const a = cell(0);
    const order: string[] = [];
    scope(() => {
      effect(() => { a.read(); order.push('first'); });
      effect(() => { a.read(); order.push('second'); });
    });
    order.length = 0;
    a.putT1(1);
    assert.deepEqual(order, ['first', 'second']);
  });

  test('effects cannot be created outside a scope', () => {
    assert.throws(() => effect(() => {}), /effect outside a scope/);
  });
});

// ---------------------------------------------------------------------------
// Randomized glitch-freedom test

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
}

function fuzz(seed: number): { checks: number; bad: number } {
  const rnd = lcg(seed);
  let bad = 0;
  let checks = 0;
  for (let g = 0; g < 100; g++) {
    const cells = Array.from({ length: 5 }, () => cell(Math.floor(rnd() * 5)));
    const spec: { ins: number[]; m: boolean }[] = [];
    const nodes: Readable<number>[] = [...cells];
    for (let i = 0; i < 25; i++) {
      const ins = nodes.map((_, j) => j).filter(() => rnd() < 0.25);
      if (!ins.length) ins.push(0);
      const m = rnd() < 0.3;
      spec.push({ ins, m });
      nodes.push(derived(() => {
        const s = ins.reduce((a, j) => a + nodes[j].read(), 0);
        return m ? s % 3 : s;
      }));
    }
    const evalNode = (k: number, vals: number[]): number => {
      if (k < 5) return vals[k];
      const { ins, m } = spec[k - 5];
      const s = ins.reduce((a, j) => a + evalNode(j, vals), 0);
      return m ? s % 3 : s;
    };
    const watched = nodes.map((_, i) => i).filter((i) => i >= 5 && rnd() < 0.4);
    const last: Record<number, number> = {};
    const runs: Record<number, number> = {};
    const stop = scope(() => {
      for (const k of watched) effect(() => { last[k] = nodes[k].read(); runs[k] = (runs[k] || 0) + 1; });
    });
    for (let step = 0; step < 50; step++) {
      for (const k of watched) runs[k] = 0;
      batch(() => {
        const n = 1 + Math.floor(rnd() * 3);
        for (let w = 0; w < n; w++) cells[Math.floor(rnd() * 5)].putT1(Math.floor(rnd() * 5));
      });
      const vals = cells.map((c) => c.value);
      for (const k of watched) {
        checks++;
        if (last[k] !== evalNode(k, vals) || runs[k] > 1) bad++;
      }
    }
    stop();
    if (cells.some((c) => c.targets.size)) bad++;
  }
  return { checks, bad };
}

describe('randomized glitch freedom', () => {
  test('fixed seed', () => {
    const { checks, bad } = fuzz(42);
    assert.ok(checks > 1000);
    assert.equal(bad, 0);
  });

  test('random seed', () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const { bad } = fuzz(seed);
    assert.equal(bad, 0, `fuzz failed with seed ${seed}`);
  });
});

describe('writes from effects (#70)', () => {
  // W writes c := a * 10 whenever a changes; R reads a and c.
  const trace = (order: 'WR' | 'RW'): string[] => {
    const a = cell(0);
    const c = cell(0);
    const log: string[] = [];
    const W = () => effect(() => { const v = a.read(); untracked(() => c.putT1(v * 10)); });
    const R = () => effect(() => { log.push(`a=${a.read()} c=${c.read()}`); });
    const stop = scope(() => {
      if (order === 'WR') { W(); R(); } else { R(); W(); }
    });
    log.length = 0;
    a.putT1(1);
    stop();
    return log;
  };

  test('a write takes effect in the next round whatever the subscription order', () => {
    assert.deepEqual(trace('WR'), ['a=1 c=0', 'a=1 c=10']);
    assert.deepEqual(trace('RW'), ['a=1 c=0', 'a=1 c=10']);
  });

  test('a read after a write in the same effect returns the old value', () => {
    const a = cell(0);
    const c = cell(0);
    const seen: number[] = [];
    const stop = scope(() => {
      effect(() => {
        const v = a.read();
        untracked(() => { c.putT1(v + 1); seen.push(c.read()); });
      });
    });
    assert.deepEqual(seen, [0]);
    assert.equal(c.read(), 1);
    a.putT1(5);
    assert.deepEqual(seen, [0, 1]);
    assert.equal(c.read(), 6);
    stop();
  });

  test('writes and fires from one round are seen together in the next', () => {
    const a = cell(0);
    const c = cell(0);
    const e = eventSource<number>();
    const seen: string[] = [];
    const stop = scope((s) => {
      subscribeEvent(s, e, (n) => { seen.push(`e=${n} c=${sample(c)}`); });
      effect(() => {
        const v = a.read();
        if (v === 0) return;
        untracked(() => { c.putT1(v); e.fireT1(v); });
      });
    });
    a.putT1(3);
    assert.deepEqual(seen, ['e=3 c=3']);
    stop();
  });

  test('two effects writing one cell in a round: the later effect wins, whatever the creation order of readers', () => {
    const a = cell(0);
    const c = cell('');
    const seen: string[] = [];
    const stop = scope(() => {
      effect(() => { seen.push(c.read()); });
      effect(() => { const v = a.read(); untracked(() => c.putT1(`x${v}`)); });
      effect(() => { const v = a.read(); untracked(() => c.putT1(`y${v}`)); });
    });
    seen.length = 0;
    a.putT1(1);
    // Effects run in creation order within a round, so y's write is last.
    assert.deepEqual(seen, ['y1']);
    stop();
  });

  test('modify from two effects in one round composes both updates', () => {
    const a = cell(0);
    const n = cell(0);
    const stop = scope(() => {
      effect(() => { if (a.read() > 0) untracked(() => n.modifyT1((x) => x + 1)); });
      effect(() => { if (a.read() > 0) untracked(() => n.modifyT1((x) => x * 10)); });
    });
    a.putT1(1);
    assert.equal(n.read(), 10);
    stop();
  });

  test('a deferred write equal to the current value changes nothing', () => {
    const a = cell(0);
    const c = cell(7);
    let runs = 0;
    const stop = scope(() => {
      effect(() => { c.read(); runs++; });
      effect(() => { a.read(); untracked(() => { c.putT1(8); c.putT1(7); }); });
    });
    const before = runs;
    const v = c.version;
    a.putT1(1);
    assert.equal(c.version, v);
    assert.equal(runs, before);
    stop();
  });

  test('a write inside a batch takes effect when the batch ends', () => {
    const c = cell(0);
    batch(() => {
      c.putT1(1);
      assert.equal(c.read(), 0);
      assert.equal(c.readT1(), 1);
    });
    assert.equal(c.read(), 1);
  });

  test('a write outside any batch, effect or flush takes effect at once', () => {
    const c = cell(0);
    c.putT1(1);
    assert.equal(c.read(), 1);
  });
});
