import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cell, scope, effect, sample, stepper, eventSource, map, createScope,
  setDevHook, setStrict, tagScope, scopeInfo, rootScopes, effectCount, type DevEvent,
  setScopeNodes, ownerOfNode, setTrackOrigins, originOf, setConsistencyCheck, registerCheck,
  nodeKind, nodeInputs, eventSource as es,
} from '../../src/Screamer/Runtime.ts';

/** Run `f` with a dev hook installed, returning the events it saw. */
function events(f: () => void): DevEvent[] {
  const seen: DevEvent[] = [];
  setDevHook((e) => { seen.push(e); });
  try {
    f();
  } finally {
    setDevHook(null);
  }
  return seen;
}

describe('development hook (#84)', () => {
  test('reports scopes, effect runs, rounds and writes', () => {
    const a = cell(0);
    let stop!: () => void;
    const seen = events(() => {
      stop = scope(() => { effect(() => { a.read(); }); });
      a.putT1(1);
      stop();
    });
    assert.deepEqual(seen.map((e) => e.type), [
      'scopeCreated', 'effectRun', 'write', 'roundStart', 'effectRun', 'roundEnd', 'scopeDisposed',
    ]);
  });

  test('reports a warning with its code and the scope it came from', () => {
    const src = eventSource<number>();
    const last = stepper(0, src);
    const stop = scope(() => { effect(() => { last.read(); }); });
    stop();
    const warn = console.warn;
    console.warn = () => {};
    try {
      const seen = events(() => { sample(last); });
      assert.equal(seen.length, 1);
      const w = seen[0] as Extract<DevEvent, { type: 'warning' }>;
      assert.equal(w.code, 'SCR001');
      assert.match(w.message, /^screamer SCR001: read of a paused stateful signal/);
    } finally {
      console.warn = warn;
    }
  });

  test('strict mode throws warnings, every time', () => {
    const src = eventSource<number>();
    const last = stepper(0, src);
    const stop = scope(() => { effect(() => { last.read(); }); });
    stop();
    setStrict(true);
    try {
      assert.throws(() => sample(last), /^Error: screamer SCR001:/);
      assert.throws(() => sample(last), /screamer SCR001:/);
    } finally {
      setStrict(false);
    }
  });

  test('errors carry codes', () => {
    const a = cell(1);
    const b = cell(0);
    assert.throws(() => map((x: number) => { b.putT1(x); return x; }, a).read(), /screamer SCR101: write inside a derivation/);
  });

  test('records scope tags, live roots and effect counts', () => {
    const before = rootScopes().length;
    const root = createScope(null);
    const child = createScope(root);
    tagScope(child, 'each', '', 3);
    assert.equal(scopeInfo(child).kind, 'each');
    assert.equal(scopeInfo(child).key, 3);
    assert.ok(scopeInfo(child).id > scopeInfo(root).id);
    assert.equal(rootScopes().length, before + 1);
    scope(() => { effect(() => {}); }, child);
    assert.equal(effectCount([...child.children][0]), 1);
    root.dispose();
    assert.equal(rootScopes().length, before);
  });

  test('maps nodes to the innermost live scope that recorded them', () => {
    const root = createScope(null);
    const inner = createScope(root);
    const node = {};
    setScopeNodes(inner, [node]);
    setScopeNodes(root, [node]);
    assert.equal(ownerOfNode(node), inner);
    assert.deepEqual(scopeInfo(root).nodes, [node]);
    inner.dispose();
    assert.equal(ownerOfNode(node), null);
    root.dispose();
  });

  test('records creation sites only while tracking', () => {
    const before = cell(0);
    setTrackOrigins(true);
    let after;
    try {
      after = cell(0);
    } finally {
      setTrackOrigins(false);
    }
    assert.equal(originOf(before), null);
    assert.match(originOf(after)!, /devhook\.test\.ts/);
  });

  test('reports a failed consistency check after the timestep, with its scope', () => {
    const a = cell(0);
    const b = cell(0);
    let shown = 0;
    setConsistencyCheck(true);
    const warn = console.warn;
    console.warn = () => {};
    try {
      const seen = events(() => {
        const stop = scope((s) => {
          effect(() => { shown = a.read(); });
          effect(() => { b.read(); });
          registerCheck(s, () => (shown === sample(a) ? null : `shows ${shown}`));
        });
        a.putT1(1);
        shown = 5; // behind the effect's back
        b.putT1(1); // a timestep that does not touch `a`: the check finds it
        stop();
      });
      const w = seen.filter((e) => e.type === 'warning') as Extract<DevEvent, { type: 'warning' }>[];
      assert.equal(w.length, 1);
      assert.match(w[0].message, /^screamer SCR003: shows 5/);
      assert.notEqual(w[0].scope, null);
    } finally {
      console.warn = warn;
      setConsistencyCheck(false);
    }
  });

  test('describes nodes and their inputs', () => {
    const a = cell(1);
    const m = map((x: number) => x + 1, a);
    m.read();
    assert.equal(nodeKind(a), 'signal source');
    assert.equal(nodeKind(es()), 'event source');
    assert.equal(nodeKind(m), 'derived signal');
    assert.deepEqual(nodeInputs(m).inputs, [a]);
  });
});
