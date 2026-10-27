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

// ES2021, which every runtime the tools run in has; the build targets ES2020.
declare class WeakRef<T extends object> {
  constructor(target: T);
  deref(): T | undefined;
}

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
  nodes: string[];
  children: ScopeTree[];
}

/** A node as a short string: `<li#id>`, a text node's text, or `<!---->`. */
function describeNode(n: any): string {
  if (n === null || typeof n !== 'object' || typeof n.nodeType !== 'number') return '<node>';
  switch (n.nodeType) {
    case 1: {
      const tag = String(n.tagName).toLowerCase();
      const id = typeof n.id === 'string' && n.id !== '' ? `#${n.id}` : '';
      return `<${tag}${id}>`;
    }
    case 3: {
      const t = String(n.data);
      return JSON.stringify(t.length > 24 ? `${t.slice(0, 24)}…` : t);
    }
    case 8:
      return '<!---->';
    case 11:
      return '#fragment';
    default:
      return '<node>';
  }
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
    nodes: info.nodes.map(describeNode),
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
    const nodes = tree.nodes.length > 0 ? ` ${tree.nodes.join(' ')}` : '';
    lines.push(`${'  '.repeat(depth)}${last}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}${nodes}`);
    tree.children.forEach((c) => go(c, depth + 1));
  };
  roots.forEach((r) => go(r, 0));
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Between the page and the tree

/** The live scope at `path`, or null. */
function findScope(path: string): Scope | null {
  const parts = path.split('/');
  let level = R.rootScopes();
  let found: Scope | null = null;
  for (const part of parts) {
    const names = segments(level);
    const i = names.indexOf(part);
    if (i < 0) return null;
    found = level[i];
    level = Array.from(found.children);
  }
  return found;
}

/** The innermost live scope whose element built `node` or one of its ancestors. */
function scopeOfNode(node: any): Scope | null {
  for (let n = node; n !== null && n !== undefined; n = n.parentNode) {
    const s = R.ownerOfNode(n);
    if (s !== null) return s;
  }
  return null;
}

export const scopeOfImpl = (just: (s: string) => unknown) => (nothing: unknown) => (node: unknown) => (): unknown => {
  const s = scopeOfNode(node);
  return s === null ? nothing : just(pathOf(s)!);
};

export const nodesOfImpl = (path: string) => (): unknown[] => {
  const s = findScope(path);
  return s === null ? [] : R.scopeInfo(s).nodes.slice();
};

// ---------------------------------------------------------------------------
// Creation sites

/**
 * Frames inside the runtime and the `Effect` plumbing, which say nothing
 * about the program. Frames in `Screamer.Element` stay: they say which
 * primitive (`mount`, `dyn`, `each`) made a scope.
 */
const internal = /node:internal|[\\/]output(-es)?[\\/](Effect|Effect\.[A-Za-z.]+|Control\.[A-Za-z.]+|Data\.[A-Za-z.]+|Test\.Spec[A-Za-z.]*|Screamer\.(Runtime|Runtime\.Unsafe|Owned|Context|Devtools))[\\/]|[\\/]screamer-(reactive|devtools)[\\/]src[\\/]/;

/** The first few frames of `x`'s creation site outside Screamer, or empty when not tracked. */
function originText(x: object): string {
  const stack = R.originOf(x);
  if (stack === null) return '';
  const frames = stack.split('\n').slice(1).map((l) => l.trim()).filter((l) => l !== '' && !internal.test(l));
  return frames.slice(0, 3).join('\n');
}

export const setTrackOrigins = (b: boolean) => (): void => {
  requireDev('setTrackOrigins');
  R.setTrackOrigins(b);
};

// ---------------------------------------------------------------------------
// Leaks

interface LiveScope {
  path: string;
  kind: string;
  name: string;
  scopes: number;
  effects: number;
  origin: string;
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
      return { path: pathOf(s)!, kind: info.kind, name: info.name, ...subtree(s), origin: originText(s) };
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
  const detail = l.scopes.map((s) => {
    const line = `  ${s.path} (${plural(s.scopes, 'scope')}, ${plural(s.effects, 'effect')})`;
    return s.origin === '' ? line : `${line}\n${s.origin.split('\n').map((f) => `    ${f}`).join('\n')}`;
  });
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

export const withStrictnessImpl = (b: boolean) => <A>(action: () => A) => (): A => {
  requireDev('withStrict');
  const was = R.isStrict();
  R.setStrict(b);
  try {
    return action();
  } finally {
    R.setStrict(was);
  }
};

export const setConsistencyCheck = (b: boolean) => (): void => {
  requireDev('setConsistencyCheck');
  R.setConsistencyCheck(b);
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

/** The signal and event sources `n` reads, directly or through derived and stateful nodes. */
function upstreamSources(n: object, limit = 10000): object[] {
  const seen: Set<object> = new Set();
  const found: object[] = [];
  const stack: object[] = [n];
  while (stack.length > 0 && seen.size < limit) {
    const x = stack.pop()!;
    if (seen.has(x)) continue;
    seen.add(x);
    const kind = R.nodeKind(x);
    if (kind === 'signal source' || kind === 'event source') {
      found.push(x);
      continue;
    }
    for (const i of R.nodeInputs(x).inputs) stack.push(i);
  }
  return found;
}

/** Why an effect ran: what it saw when its last run started. */
interface Run {
  round: number;
  scope: string;
  because: { node: number; kind: string; label: string }[];
  sources: { source: number; kind: string; by: string | null }[];
}

interface Explanation {
  summary: string;
  json: string;
}

export const startLogImpl = (opts: LogOptions) => () => {
  requireDev('startLog');
  const limit = Math.max(1, opts.limit);
  const rows: Row[] = [];
  let dropped = 0;
  let rounds = 0;
  let warnings = 0;
  let errors = 0;
  // Ids for every node the log mentions, in the order it first sees them.
  const ids: WeakMap<object, number> = new WeakMap();
  const effects: Map<number, WeakRef<object>> = new Map();
  let nextId = 0;
  const idOf = (x: object): number => {
    let n = ids.get(x);
    if (n === undefined) ids.set(x, (n = nextId++));
    return n;
  };
  let writes: Cause[] = [];
  let fires: Cause[] = [];
  // The sources behind `writes` and `fires`, and those of the current round.
  let pending: Map<object, string | null> = new Map();
  let current: Map<object, string | null> = new Map();
  let row: Extract<Row, { round: number }> | null = null;
  let started = 0;
  let steps = 0;
  // The rounds each source was last written or fired for, and each effect's last run.
  const lastWritten: WeakMap<object, number> = new WeakMap();
  const runs: Map<number, Run> = new Map();

  const push = (r: Row) => {
    rows.push(r);
    if (rows.length > limit) {
      rows.shift();
      dropped++;
    }
  };

  const describe = (x: object) => ({ node: idOf(x), kind: R.nodeKind(x), label: R.nodeLabel(x) });

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
        current = pending;
        for (const src of current.keys()) lastWritten.set(src, row.round);
        writes = [];
        fires = [];
        pending = new Map();
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
        pending.set(e.source, pathOf(e.scope));
        break;
      case 'fire':
        fires.push({ source: idOf(e.source), by: pathOf(e.scope) });
        pending.set(e.source, pathOf(e.scope));
        break;
      case 'effectRun': {
        const id = idOf(e.effect);
        const scope = pathOf(e.scope)!;
        if (row !== null) row.effects.push({ effect: id, scope });
        effects.set(id, new WeakRef(e.effect));
        // The run has not started: the effect's inputs still hold the
        // versions it saw last time, so a changed version is a cause.
        const { inputs, versions } = R.nodeInputs(e.effect);
        const because = inputs.filter((x, i) => versions === null || x.version !== versions[i]).map(describe);
        const sources = upstreamSources(e.effect)
          .filter((x) => current.has(x))
          .map((x) => ({ source: idOf(x), kind: R.nodeKind(x), by: current.get(x)! }));
        runs.set(id, { round: row === null ? -1 : row.round, scope, because, sources });
        break;
      }
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

  const explain = (summary: string, data: object): Explanation => ({
    summary,
    json: JSON.stringify({ version: FORMAT, ...data }),
  });

  const name = (x: { kind: string; label: string }, id: number) => `${x.kind}${x.label === '' ? '' : ` (${x.label})`} ${id}`;

  const why = (id: number) => (): Explanation => {
    const run = runs.get(id);
    if (run === undefined) return explain(`effect ${id} has not run while the log was recording`, { effect: id, ran: false });
    const e = effects.get(id)?.deref();
    const origin = e === undefined ? '' : originText(e);
    const parts: string[] = [];
    if (run.round < 0) parts.push(`effect ${id} in ${run.scope} last ran when it was created`);
    else {
      parts.push(`effect ${id} in ${run.scope} last ran in round ${run.round}`);
      if (run.because.length > 0) parts.push(`because ${run.because.map((b) => `${name(b, b.node)} updated`).join(', ')}`);
      if (run.sources.length > 0) {
        parts.push(`, which ${run.sources.length === 1 ? 'follows' : 'follow'} ${run.sources
          .map((x) => `${x.kind} ${x.source} ${x.kind === 'event source' ? 'fired' : 'written'} by ${x.by ?? 'an event handler'}`)
          .join(', ')}`);
      }
    }
    return explain(parts.join(' ').replace(' , which', ', which') + (origin === '' ? '' : `\ncreated at\n${origin}`), { effect: id, ran: true, ...run, origin });
  };

  const whyNot = (id: number) => (): Explanation => {
    const e = effects.get(id)?.deref();
    if (e === undefined) return explain(`effect ${id} is unknown to the log, or has been collected`, { effect: id, known: false });
    if (R.effectDisposed(e as any)) return explain(`effect ${id} is disposed, so it never runs again`, { effect: id, disposed: true });
    const run = runs.get(id)!;
    const { inputs, versions } = R.nodeInputs(e);
    if (inputs.length === 0) {
      return explain(`effect ${id} in ${run.scope} read no signal or event when it last ran, so nothing can run it again`, { effect: id, inputs: [] });
    }
    const reasons = inputs.map((x, i) => {
      const d = describe(x);
      if (versions !== null && x.version !== versions[i]) return { ...d, reason: 'updated; the effect runs in the next round' };
      if (d.kind === 'signal source' || d.kind === 'event source') {
        const r = lastWritten.get(x);
        if (r !== undefined && r > run.round) {
          return { ...d, reason: `written in round ${r} with the value it already had, so it did not update` };
        }
        return { ...d, reason: `not ${d.kind === 'event source' ? 'fired' : 'written'} since the effect last ran` };
      }
      const later = upstreamSources(x).filter((src) => (lastWritten.get(src) ?? -1) > run.round);
      if (later.length > 0) {
        return {
          ...d,
          reason: `upstream ${later.map((src) => `${R.nodeKind(src)} ${idOf(src)}`).join(', ')} changed since, but this node did not update (an equal value, dropRepeats or a filter)`,
        };
      }
      return { ...d, reason: 'no source upstream of it has changed since the effect last ran' };
    });
    const summary = [`effect ${id} in ${run.scope} has not run since ${run.round < 0 ? 'it was created' : `round ${run.round}`}:`]
      .concat(reasons.map((r) => `  ${name(r, r.node)}: ${r.reason}`))
      .join('\n');
    return explain(summary, { effect: id, lastRound: run.round, inputs: reasons });
  };

  return { read, stop, why, whyNot };
};

// ---------------------------------------------------------------------------
// Recordings
//
// A recording holds the writes and fires made from outside every scope and
// effect (event handlers, timers, a test's own actions) to sources created
// while it records, grouped by the round they started. Sources are named by
// creation order, so a replay that builds the same program creates them in
// the same order and the writes can be matched to them. Writes that effects
// make are not recorded: the replay makes them again.

interface Op {
  source: number;
  kind: 'write' | 'fire';
  value?: unknown;
  opaque?: true;
}

interface Recording {
  version: number;
  steps: Op[][];
  external: number;
}

/** Whether `v` survives a trip through JSON unchanged. */
function encodable(v: unknown, depth = 0): boolean {
  if (depth > 50) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => encodable(x, depth + 1));
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(v as object).every((x) => encodable(x, depth + 1));
  }
  return false;
}

export const startRecording = () => {
  requireDev('startRecording');
  const index: WeakMap<object, number> = new WeakMap();
  let created = 0;
  const steps: Op[][] = [];
  let step: Op[] = [];
  let external = 0;
  const stopListening = listen((e) => {
    switch (e.type) {
      case 'sourceCreated':
        index.set(e.source, created++);
        break;
      case 'write':
      case 'fire': {
        if (e.scope !== null) break;
        const i = index.get(e.source);
        if (i === undefined) {
          external++;
          break;
        }
        step.push(encodable(e.value) ? { source: i, kind: e.type, value: e.value } : { source: i, kind: e.type, opaque: true });
        break;
      }
      case 'roundStart':
        if (step.length > 0) {
          steps.push(step);
          step = [];
        }
        break;
    }
  });
  return {
    stop: (): Recording => {
      stopListening();
      if (step.length > 0) steps.push(step);
      return { version: FORMAT, steps, external };
    },
  };
};

export const encodeRecording = (r: Recording): string => JSON.stringify(r);

export const decodeRecordingImpl =
  (left: (e: string) => unknown) => (right: (r: Recording) => unknown) => (text: string): unknown => {
    let r: any;
    try {
      r = JSON.parse(text);
    } catch (e) {
      return left(`not JSON: ${errorMessage(e)}`);
    }
    if (r === null || typeof r !== 'object') return left('not a recording');
    if (r.version !== FORMAT) return left(`recording format ${r.version}, expected ${FORMAT}`);
    if (!Array.isArray(r.steps) || typeof r.external !== 'number') return left('not a recording');
    for (const step of r.steps) {
      if (!Array.isArray(step)) return left('a step is not a list');
      for (const op of step) {
        if (op === null || typeof op.source !== 'number' || (op.kind !== 'write' && op.kind !== 'fire')) {
          return left('an operation is malformed');
        }
      }
    }
    return right(r as Recording);
  };

/** How many steps and writes a recording holds. */
export const recordingSize = (r: Recording) => ({
  steps: r.steps.length,
  writes: r.steps.reduce((n, s) => n + s.length, 0),
  opaque: r.steps.reduce((n, s) => n + s.filter((op) => op.opaque === true).length, 0),
  external: r.external,
});

/**
 * Run `mount` while numbering the sources it creates, then apply the
 * recording's steps, each in one batch, numbering the sources the steps
 * create too. Returns `mount`'s result and how many writes were applied and
 * skipped (opaque values, or sources the replay never created).
 */
export const replayImpl = (r: Recording) => <A>(mount: () => A) => () => {
  requireDev('replay');
  const sources: object[] = [];
  let applied = 0;
  let skipped = 0;
  const stop = listen((e) => {
    if (e.type === 'sourceCreated') sources.push(e.source);
  });
  try {
    const value = mount();
    for (const step of r.steps) {
      R.batch(() => {
        for (const op of step) {
          const src: any = sources[op.source];
          if (op.opaque === true || src === undefined || R.nodeKind(src) !== (op.kind === 'write' ? 'signal source' : 'event source')) {
            skipped++;
            continue;
          }
          if (op.kind === 'write') src.putT1(op.value);
          else src.fireT1(op.value);
          applied++;
        }
      });
    }
    return { value, applied, skipped };
  } finally {
    stop();
  }
};

// ---------------------------------------------------------------------------
// The page global
//
// `window.__SCREAMER_DEVTOOLS__` gives a script in the page (Playwright's
// `page.evaluate`, or `npm run inspect`) the same data, with plain
// functions in place of curried effects.

export const exposeGlobalImpl = () => {
  if (!R.development || typeof globalThis === 'undefined') return;
  const g: any = globalThis;
  const api: any = {
    version: FORMAT,
    snapshotJson: () => JSON.parse(snapshotJson()),
    snapshotText: () => snapshotText(),
    scopeOf: (node: unknown) => {
      const s = scopeOfNode(node);
      return s === null ? null : pathOf(s);
    },
    nodesOf: (path: string) => nodesOfImpl(path)(),
    startLog: (o?: Partial<LogOptions>) => {
      const log = startLogImpl({ limit: o?.limit ?? 1000, timings: o?.timings ?? false })();
      return {
        read: (under = '') => log.read({ under })(),
        stop: () => log.stop(),
        why: (id: number) => log.why(id)().summary,
        whyNot: (id: number) => log.whyNot(id)().summary,
      };
    },
    setStrict: (b: boolean) => R.setStrict(b),
    setTrackOrigins: (b: boolean) => R.setTrackOrigins(b),
    setConsistencyCheck: (b: boolean) => R.setConsistencyCheck(b),
    warnings: [] as { code: string; message: string; scope: string | null }[],
  };
  // Keep the newest 100 warnings, so a script can read what it missed.
  listen((e) => {
    if (e.type !== 'warning') return;
    api.warnings.push({ code: e.code, message: e.message, scope: pathOf(e.scope) });
    if (api.warnings.length > 100) api.warnings.shift();
  });
  // A script that sets this flag before the page loads gets a log of
  // everything from the first mount.
  if (g.__SCREAMER_DEVTOOLS_LOG__ === true) api.log = api.startLog();
  g.__SCREAMER_DEVTOOLS__ = api;
};
