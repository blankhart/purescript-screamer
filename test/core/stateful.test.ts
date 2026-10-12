import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cell, derived, map, bind, fold, merge, filter, filterOn, hold, scope, effect, batch, stats,
  Readable,
} from '../../src/Screamer/Reactive/Core.ts';

describe('prototype checks', () => {
  test('6 fold steps only while observed, keeps its state, coalesces within a batch', () => {
    const clicks = cell(0);
    const count = fold((_: number, n: number) => n + 1, 0, clicks);
    const seen: number[] = [];
    let stop = scope(() => { effect(() => { seen.push(count.read()); }); });
    clicks.write(1);
    clicks.write(2);
    clicks.write(3);
    stop();
    clicks.write(4);
    clicks.write(5);
    assert.equal(count.read(), 3);
    stop = scope(() => { effect(() => { seen.push(count.read()); }); });
    batch(() => { clicks.write(6); clicks.write(7); });
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
    c.write(2);
    c.write(5);
    assert.equal(seen.length, 3);
    assert.ok(seen.every(Boolean));
    stop();
  });

  test('7 merge: latest wins, simultaneous writes prefer the left input', () => {
    const a = cell('a0');
    const b = cell('b0');
    const m = merge(a, b);
    const seen: string[] = [];
    const stop = scope(() => { effect(() => { seen.push(m.read()); }); });
    b.write('b1');
    a.write('a1');
    batch(() => { a.write('a2'); b.write('b2'); });
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
    t.write(1);
    b.write('b1');
    assert.equal(m!.read(), 'b1');
    s1();
    s2();
  });

  test('8 filter', () => {
    const s = cell(1);
    const evens = filter((x: number) => x % 2 === 0, 0, s);
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(evens.read()); }); });
    s.write(2);
    s.write(3);
    s.write(4);
    assert.equal(seen.join(' '), '0 2 4');
    stop();
  });
});

describe('hold', () => {
  test('keeps a fold advancing while no view reads it, and stops with its scope', () => {
    const clicks = cell(0);
    const count = fold((_: number, n: number) => n + 1, 0, clicks);
    const stop = scope(() => { hold(count); });
    clicks.write(1);
    clicks.write(2);
    assert.equal(count.read(), 2);
    stop();
    clicks.write(3);
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

describe('filterOn', () => {
  test('follows the source while the condition holds and keeps its value otherwise', () => {
    const cond = cell(true);
    const src = cell(1);
    const f = filterOn(cond, 0, src);
    const seen: number[] = [];
    const stop = scope(() => { effect(() => { seen.push(f.read()); }); });
    src.write(2);
    cond.write(false);
    src.write(3);
    src.write(4);
    cond.write(true);
    src.write(5);
    batch(() => { cond.write(false); src.write(6); });
    batch(() => { cond.write(true); src.write(7); });
    assert.deepEqual(seen, [1, 2, 4, 5, 7]);
    stop();
  });

  test('starts at the seed when the condition is false', () => {
    const cond = cell(false);
    const src = cell(1);
    const f = filterOn(cond, 0, src);
    assert.equal(f.read(), 0);
  });
});

describe('stateful nodes in the graph', () => {
  test('a fold under a derived node pauses when the derived node is unobserved', () => {
    const c = cell(0);
    const count = fold((_: number, n: number) => n + 1, 0, c);
    const doubled = map((n: number) => n * 2, count);
    const seen: number[] = [];
    let stop = scope(() => { effect(() => { seen.push(doubled.read()); }); });
    c.write(1);
    stop();
    c.write(2);
    stop = scope(() => { effect(() => { seen.push(doubled.read()); }); });
    c.write(3);
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
    clicks.write(1);
    clicks.write(2);
    which.write(1);
    clicks.write(3);
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
    c.write(2);
    c.write(-1);
    c.write(3);
    assert.equal(errors.length, 1);
    assert.deepEqual(seen, [0, 2, 5]);
    stop();
  });

  test('step counter only advances while observed', () => {
    const c = cell(0);
    const f = fold((v: number, acc: number) => acc + v, 0, c);
    const before = stats.steps;
    for (let i = 1; i <= 10; i++) c.write(i);
    assert.equal(stats.steps - before, 0);
    assert.equal(f.read(), 0);
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

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
}

const foldStep = (v: number, acc: number) => (acc * 31 + v + 1) % 1009;

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
      batch(() => { for (const c of targets) cells[c].write(pick(5)); });
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
