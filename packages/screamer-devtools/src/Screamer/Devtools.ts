// Foreign module of Screamer.Devtools: the headless inspection API (#84).
//
// Everything here reads the runtime through `Screamer.Runtime.Unsafe`: the
// development hook, strict mode, and what the runtime records about scopes.
// The runtime has one hook; this module shares it among its listeners (a
// log, a leak check and a work count can run at once).
import type * as Runtime from '../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Devtools/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Scope = Runtime.Scope;
type DevEvent = Runtime.DevEvent;
type DevHook = Runtime.DevHook;

/** The version of the JSON forms. They are unstable until the package's first release. */
const FORMAT = 1;

function requireDev(what: string): void {
  if (!R.development) throw new Error(`screamer-devtools: ${what} needs a development build (__DEV__ is false)`);
}

// ---------------------------------------------------------------------------
// The hook, shared

const listeners: Set<DevHook> = new Set();

function dispatch(e: DevEvent): void {
  for (const h of Array.from(listeners)) h(e);
}

/** Add a listener to the runtime's hook; the result removes it. */
function listen(h: DevHook): () => void {
  listeners.add(h);
  if (listeners.size === 1) R.setDevHook(dispatch);
  return () => {
    listeners.delete(h);
    if (listeners.size === 0) R.setDevHook(null);
  };
}

/** Run `action` with `h` listening, and stop listening however it ends. */
function listening<T>(h: DevHook, action: () => T): T {
  const stop = listen(h);
  try {
    return action();
  } finally {
    stop();
  }
}

// ---------------------------------------------------------------------------
// Scope paths
//
// A path names a scope by what made it rather than by an address, so it is
// the same for the same program and inputs: `root/named:App/dyn/each[key=3]`.
// A segment is the scope's name if it has one (`named`), else its kind
// (`dyn`, `each`, `portal`, ...), else `scope`, with an `each` row's key.
// When siblings share a segment, each gets its index among them (`dyn#1`).

function showKey(k: unknown): string {
  if (typeof k === 'string') return JSON.stringify(k);
  if (typeof k === 'number' || typeof k === 'boolean') return String(k);
  if (typeof k === 'function') return '<function>';
  return '<opaque>';
}

function label(s: Scope): string {
  const info = R.scopeInfo(s);
  let l = info.name !== '' ? `named:${info.name}` : info.kind !== '' ? info.kind : s.parent === null ? 'root' : 'scope';
  if (info.key !== undefined) l += `[key=${showKey(info.key)}]`;
  return l;
}

/** The segments of a list of siblings, in one pass. */
function segments(siblings: Scope[]): string[] {
  const labels = siblings.map(label);
  const counts: Map<string, number> = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const seen: Map<string, number> = new Map();
  return labels.map((l) => {
    if (counts.get(l)! === 1) return l;
    const i = seen.get(l) ?? 0;
    seen.set(l, i + 1);
    return `${l}#${i}`;
  });
}

function segment(s: Scope): string {
  const l = label(s);
  const siblings = s.parent === null ? R.rootScopes() : Array.from(s.parent.children);
  let same = 0;
  let index = -1;
  for (const x of siblings) {
    if (x === s) index = same;
    if (label(x) === l) same++;
  }
  return same > 1 && index >= 0 ? `${l}#${index}` : l;
}

function pathOf(s: Scope | null): string | null {
  if (s === null) return null;
  const parts: string[] = [];
  for (let x: Scope | null = s; x !== null; x = x.parent) parts.push(segment(x));
  return parts.reverse().join('/');
}

export const scopePathImpl = (s: Scope) => (): string => pathOf(s)!;

// ---------------------------------------------------------------------------
// Snapshots

interface ScopeTree {
  path: string;
  kind: string;
  name: string;
  key: string;
  effects: number;
  cleanups: number;
  context: string[];
  children: ScopeTree[];
}

function treeOf(s: Scope, path: string): ScopeTree {
  const info = R.scopeInfo(s);
  const effects = R.effectCount(s);
  const cs = Array.from(s.children);
  const names = segments(cs);
  const children = cs.map((c, i) => treeOf(c, `${path}/${names[i]}`));
  return {
    path,
    kind: info.kind,
    name: info.name,
    key: info.key === undefined ? '' : showKey(info.key),
    effects,
    cleanups: s.cleanups.length - effects,
    context: s.ctx === null ? [] : Object.keys(s.ctx),
    children,
  };
}

function snapshotTrees(): ScopeTree[] {
  const roots = R.rootScopes();
  const names = segments(roots);
  return roots.map((s, i) => treeOf(s, names[i]));
}

function totals(trees: ScopeTree[]): { roots: number; scopes: number; effects: number } {
  let scopes = 0;
  let effects = 0;
  const go = (t: ScopeTree) => {
    scopes++;
    effects += t.effects;
    t.children.forEach(go);
  };
  trees.forEach(go);
  return { roots: trees.length, scopes, effects };
}

const plural = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const snapshot = (): ScopeTree[] => snapshotTrees();

export const snapshotJson = (): string => {
  const roots = snapshotTrees();
  return JSON.stringify({ version: FORMAT, summary: totals(roots), roots });
};

export const snapshotText = (): string => {
  const roots = snapshotTrees();
  const t = totals(roots);
  const lines = [`${plural(t.roots, 'root')}, ${plural(t.scopes, 'scope')}, ${plural(t.effects, 'effect')}`];
  const go = (tree: ScopeTree, depth: number) => {
    const last = tree.path.slice(tree.path.lastIndexOf('/') + 1);
    const notes: string[] = [];
    if (tree.effects > 0) notes.push(plural(tree.effects, 'effect'));
    if (tree.cleanups > 0) notes.push(plural(tree.cleanups, 'cleanup'));
    if (tree.context.length > 0) notes.push(`provides ${tree.context.join(', ')}`);
    lines.push(`${'  '.repeat(depth)}${last}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`);
    tree.children.forEach((c) => go(c, depth + 1));
  };
  roots.forEach((r) => go(r, 0));
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Leaks

interface LiveScope {
  path: string;
  kind: string;
  name: string;
  scopes: number;
  effects: number;
}

interface Leaks {
  scopes: LiveScope[];
  effects: number;
  summary: string;
}

function subtree(s: Scope): { scopes: number; effects: number } {
  let scopes = 1;
  let effects = R.effectCount(s);
  for (const c of Array.from(s.children)) {
    const t = subtree(c);
    scopes += t.scopes;
    effects += t.effects;
  }
  return { scopes, effects };
}

export const leaksImpl = (action: () => void) => (): Leaks => {
  requireDev('leaks');
  const created: Set<Scope> = new Set();
  const before = R.readStats().liveEffects;
  listening((e) => {
    if (e.type === 'scopeCreated') created.add(e.scope);
    else if (e.type === 'scopeDisposed') created.delete(e.scope);
  }, action);
  const alive = Array.from(created).filter((s) => !s.disposed);
  const set = new Set(alive);
  // Report each leaked subtree once, at its top.
  const scopes = alive
    .filter((s) => s.parent === null || !set.has(s.parent))
    .map((s) => {
      const info = R.scopeInfo(s);
      return { path: pathOf(s)!, kind: info.kind, name: info.name, ...subtree(s) };
    });
  const effects = R.readStats().liveEffects - before;
  const parts: string[] = [];
  if (scopes.length > 0) parts.push(plural(scopes.length, 'leaked scope'));
  if (effects > 0) parts.push(`${plural(effects, 'more live effect', 'more live effects')}`);
  if (effects < 0) parts.push(`${plural(-effects, 'fewer live effect', 'fewer live effects')}`);
  const summary = parts.length === 0 ? 'no leaks' : parts.join(', ');
  return { scopes, effects, summary };
};

export const assertNoLeaksImpl = (action: () => void) => (): void => {
  const l = leaksImpl(action)();
  if (l.scopes.length === 0 && l.effects === 0) return;
  const detail = l.scopes.map((s) => `  ${s.path} (${plural(s.scopes, 'scope')}, ${plural(s.effects, 'effect')})`);
  throw new Error([`screamer-devtools: ${l.summary}`, ...detail].join('\n'));
};

// ---------------------------------------------------------------------------
// Work counts

interface Work {
  rounds: number;
  effectRuns: number;
  steps: number;
  writes: number;
  fires: number;
  scopesCreated: number;
  scopesDisposed: number;
}

export const countWorkImpl = (action: () => void) => (): Work => {
  requireDev('countWork');
  const w: Work = { rounds: 0, effectRuns: 0, steps: 0, writes: 0, fires: 0, scopesCreated: 0, scopesDisposed: 0 };
  const steps = R.readStats().steps;
  listening((e) => {
    switch (e.type) {
      case 'roundStart': w.rounds++; break;
      case 'effectRun': w.effectRuns++; break;
      case 'write': w.writes++; break;
      case 'fire': w.fires++; break;
      case 'scopeCreated': w.scopesCreated++; break;
      case 'scopeDisposed': w.scopesDisposed++; break;
    }
  }, action);
  w.steps = R.readStats().steps - steps;
  return w;
};

export const describeWork = (w: Work): string =>
  `${plural(w.rounds, 'round')}, ${plural(w.effectRuns, 'effect run')}, ${plural(w.steps, 'stateful step')}, ` +
  `${plural(w.writes, 'write')}, ${plural(w.fires, 'fire')}, ` +
  `${w.scopesCreated} scopes created, ${w.scopesDisposed} disposed`;

export const failWork = (message: string) => (): void => {
  throw new Error(`screamer-devtools: ${message}`);
};

// ---------------------------------------------------------------------------
// Strict mode

export const withStrictImpl = <A>(action: () => A) => (): A => {
  requireDev('withStrict');
  const was = R.isStrict();
  R.setStrict(true);
  try {
    return action();
  } finally {
    R.setStrict(was);
  }
};

// ---------------------------------------------------------------------------
// The timestep log
//
// One row per round, in a ring buffer. A round row lists the writes and
// fires that started it (made since the previous round started), the
// effects it ran with their scopes, and the warnings and errors reported
// while it ran. A warning or error outside every round is a row of its own.
// Sources and effects get ids in the order the log first sees them, so two
// logs of the same run are equal.

interface Cause {
  source: number;
  by: string | null;
}

type Row =
  | {
      round: number;
      writes: Cause[];
      fires: Cause[];
      effects: { effect: number; scope: string }[];
      scopes: { created: number; disposed: number };
      steps: number;
      warnings: { code: string; message: string; scope: string | null }[];
      errors: { message: string; scope: string | null }[];
      ms?: number;
    }
  | { warning: { code: string; message: string; scope: string | null } }
  | { error: { message: string; scope: string | null } };

interface LogOptions {
  limit: number;
  timings: boolean;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const under = (prefix: string) => (path: string | null): boolean =>
  prefix === '' || (path !== null && (path === prefix || path.startsWith(`${prefix}/`)));

function filterRow(row: Row, keep: (p: string | null) => boolean): Row | null {
  if ('warning' in row) return keep(row.warning.scope) ? row : null;
  if ('error' in row) return keep(row.error.scope) ? row : null;
  const r = {
    ...row,
    writes: row.writes.filter((c) => keep(c.by)),
    fires: row.fires.filter((c) => keep(c.by)),
    effects: row.effects.filter((e) => keep(e.scope)),
    warnings: row.warnings.filter((w) => keep(w.scope)),
    errors: row.errors.filter((e) => keep(e.scope)),
  };
  const any = r.writes.length + r.fires.length + r.effects.length + r.warnings.length + r.errors.length;
  return any > 0 ? r : null;
}

export const startLogImpl = (opts: LogOptions) => () => {
  requireDev('startLog');
  const limit = Math.max(1, opts.limit);
  const rows: Row[] = [];
  let dropped = 0;
  let rounds = 0;
  let warnings = 0;
  let errors = 0;
  const ids: WeakMap<object, number> = new WeakMap();
  let nextId = 0;
  const idOf = (x: object): number => {
    let n = ids.get(x);
    if (n === undefined) ids.set(x, (n = nextId++));
    return n;
  };
  let writes: Cause[] = [];
  let fires: Cause[] = [];
  let row: Extract<Row, { round: number }> | null = null;
  let started = 0;
  let steps = 0;

  const push = (r: Row) => {
    rows.push(r);
    if (rows.length > limit) {
      rows.shift();
      dropped++;
    }
  };

  const stop = listen((e) => {
    switch (e.type) {
      case 'roundStart':
        row = {
          round: rounds++,
          writes,
          fires,
          effects: [],
          scopes: { created: 0, disposed: 0 },
          steps: 0,
          warnings: [],
          errors: [],
        };
        writes = [];
        fires = [];
        steps = R.readStats().steps;
        if (opts.timings) started = performance.now();
        break;
      case 'roundEnd':
        if (row !== null) {
          row.steps = R.readStats().steps - steps;
          if (opts.timings) row.ms = performance.now() - started;
          push(row);
          row = null;
        }
        break;
      case 'write':
        writes.push({ source: idOf(e.source), by: pathOf(e.scope) });
        break;
      case 'fire':
        fires.push({ source: idOf(e.source), by: pathOf(e.scope) });
        break;
      case 'effectRun':
        if (row !== null) row.effects.push({ effect: idOf(e.effect), scope: pathOf(e.scope)! });
        break;
      case 'scopeCreated':
        if (row !== null) row.scopes.created++;
        break;
      case 'scopeDisposed':
        if (row !== null) row.scopes.disposed++;
        break;
      case 'warning': {
        warnings++;
        const w = { code: e.code, message: e.message, scope: pathOf(e.scope) };
        if (row !== null) row.warnings.push(w);
        else push({ warning: w });
        break;
      }
      case 'error': {
        errors++;
        const x = { message: errorMessage(e.error), scope: pathOf(e.scope) };
        if (row !== null) row.errors.push(x);
        else push({ error: x });
        break;
      }
    }
  });

  const read = (filter: { under: string }) => (): string => {
    const keep = under(filter.under);
    const kept: Row[] = [];
    for (const r of rows) {
      const f = filterRow(r, keep);
      if (f !== null) kept.push(f);
    }
    const summary = { version: FORMAT, rounds, rows: kept.length, dropped, warnings, errors };
    return [JSON.stringify({ summary }), ...kept.map((r) => JSON.stringify(r))].join('\n');
  };

  return { read, stop };
};
