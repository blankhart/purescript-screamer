// Screamer's reactive core.
//
// Four kinds of node; only effects have owners.
//
// - Cells are sources. They hold their observers only while observed.
// - Derived nodes are lazy: they link to their sources only while something
//   observes them, so allocating one has no effect on the graph and an
//   unobserved derived node can be garbage-collected.
// - Stateful nodes (stage 2) keep state in the node and step only while
//   observed.
// - Effects are always linked while alive and belong to a scope, which
//   disposes them.
//
// Writes mark observed dependents dirty and queue effects (push). Reads
// recompute only nodes whose recorded dependency versions changed (pull).
// An effect runs at most once per flush round and always sees a consistent
// graph. A node bumps its version only when its value changes under its
// equality, so unchanged results stop propagation.
//
// See docs/ownership-design.md.

declare const __DEV__: boolean | undefined;

/** Development checks: the write guard, cycle detection and counters. */
export const DEV: boolean = typeof __DEV__ === 'undefined' ? true : !!__DEV__;

export type Eq<T> = (a: T, b: T) => boolean;

/** Introspection counters, maintained only when `DEV` is on. */
export const stats = { liveEffects: 0, liveScopes: 0, links: 0, effectRuns: 0, steps: 0 };

export const LOOP_LIMIT = 100;

// ---------------------------------------------------------------------------
// Global state

/** Bumped on every write. An unobserved derived node read twice in one epoch returns its cache. */
let epoch = 0;
/** The computation whose dependencies are being captured, if any. */
let current: Computation | null = null;
/** The scope that owns newly created effects, if any. */
let owner: Scope | null = null;
let batchDepth = 0;
/** Greater than zero while a pure derivation (derived or stateful step) runs. */
let inDerived = 0;
let queue: EffectNode[] = [];
let nextEffectId = 0;
/** Mark counter used to diff dependency arrays without allocating sets. */
let nextMark = 0;
/** Errors from effects with no error handler, rethrown when the flush completes. */
let pendingErrors: unknown[] = [];

// ---------------------------------------------------------------------------
// Node interfaces

/** Anything that can be read and depended upon. */
export interface Source<T = any> {
  value: T;
  version: number;
  targets: Set<Target>;
  /** Bring `value` and `version` up to date. */
  refresh(): void;
  /** Called when the node gains its first target. */
  onFirstTarget?(): void;
  /** Called when the node loses its last target. */
  onLastTarget?(): void;
  /** Scratch mark for dependency capture. */
  _track: number;
  /** Scratch mark for dependency diffing. */
  _diff: number;
}

/** Anything that depends on sources and can be notified. */
export interface Target {
  /** Mark dirty (derived/stateful) or queue (effect). */
  notify(): void;
}

/** A computation that captures dependencies while it runs. */
interface Computation {
  newDeps: Source[];
  newVersions: number[];
  /** Unique id of the current run, for de-duplicating captured dependencies. */
  runMark: number;
  /** Set when another computation ran while this one was capturing. */
  nested: boolean;
}

function track(n: Source): void {
  const c = current;
  if (c === null) return;
  if (n._track === c.runMark) return;
  if (c.nested && c.newDeps.indexOf(n) >= 0) return;
  n._track = c.runMark;
  c.newDeps.push(n);
  c.newVersions.push(n.version);
}

function startCapture(c: Computation): Computation | null {
  const prev = current;
  if (prev !== null) prev.nested = true;
  c.newDeps = [];
  c.newVersions = [];
  c.runMark = ++nextMark;
  c.nested = false;
  current = c;
  return prev;
}

export function linkTo(target: Target, dep: Source): void {
  const before = dep.targets.size;
  dep.targets.add(target);
  if (dep.targets.size === before) return;
  if (DEV) stats.links++;
  if (before === 0 && dep.onFirstTarget) dep.onFirstTarget();
}

export function unlinkFrom(target: Target, dep: Source): void {
  if (!dep.targets.delete(target)) return;
  if (DEV) stats.links--;
  if (dep.targets.size === 0 && dep.onLastTarget) dep.onLastTarget();
}

/**
 * Replace the linked dependencies `oldDeps` of `target` with `newDeps`.
 * The difference is computed before any link changes, because linking can
 * run other nodes' hooks. New links are made before old ones are released,
 * so a dependency reached through both does not pause and resume.
 */
function relink(target: Target, oldDeps: Source[], newDeps: Source[]): void {
  const n = oldDeps.length;
  if (n === newDeps.length) {
    let same = true;
    for (let i = 0; i < n; i++) {
      if (oldDeps[i] !== newDeps[i]) { same = false; break; }
    }
    if (same) return;
  }
  const keep = ++nextMark;
  for (let i = 0; i < n; i++) oldDeps[i]._diff = keep;
  const added: Source[] = [];
  for (let i = 0; i < newDeps.length; i++) {
    if (newDeps[i]._diff !== keep) added.push(newDeps[i]);
  }
  const fresh = ++nextMark;
  for (let i = 0; i < newDeps.length; i++) newDeps[i]._diff = fresh;
  const removed: Source[] = [];
  for (let i = 0; i < n; i++) {
    if (oldDeps[i]._diff !== fresh) removed.push(oldDeps[i]);
  }
  for (let i = 0; i < added.length; i++) linkTo(target, added[i]);
  for (let i = 0; i < removed.length; i++) unlinkFrom(target, removed[i]);
}

/** True when any dependency's version differs from the recorded one. Refreshes dependencies in order. */
function depsChanged(deps: Source[], versions: number[]): boolean {
  for (let i = 0; i < deps.length; i++) {
    const d = deps[i];
    d.refresh();
    if (d.version !== versions[i]) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cells

export class Cell<T> implements Source<T> {
  version = 0;
  targets: Set<Target> = new Set();
  _track = 0;
  _diff = 0;
  constructor(public value: T, private eq: Eq<T> = Object.is) {}

  refresh(): void {}

  read(): T {
    track(this);
    return this.value;
  }

  write(x: T): void {
    if (DEV && inDerived > 0) throw new Error('write inside a derivation');
    if (this.eq(x, this.value)) return;
    this.value = x;
    this.version++;
    epoch++;
    if (this.targets.size === 0) return;
    batchDepth++;
    try {
      for (const t of this.targets) t.notify();
    } finally {
      if (--batchDepth === 0) flush();
    }
  }
}

export function cell<T>(value: T, eq?: Eq<T>): Cell<T> {
  return new Cell(value, eq);
}

/** A node that never changes. Reading it records no dependency worth tracking, so it is not tracked. */
export class Constant<T> implements Source<T> {
  version = 0;
  targets: Set<Target> = new Set();
  _track = 0;
  _diff = 0;
  constructor(public value: T) {}
  refresh(): void {}
  read(): T {
    return this.value;
  }
}

export function constant<T>(value: T): Constant<T> {
  return new Constant(value);
}

// ---------------------------------------------------------------------------
// Derived nodes

const UNSET: any = {};

export class Derived<T> implements Source<T>, Target, Computation {
  value: T = UNSET;
  version = 0;
  targets: Set<Target> = new Set();
  _track = 0;
  _diff = 0;
  deps: Source[] = [];
  versions: number[] = [];
  newDeps: Source[] = [];
  newVersions: number[] = [];
  runMark = 0;
  nested = false;
  /** Dependencies are linked (the node is observed). */
  linked = false;
  /** Meaningful only while linked: some dependency may have changed. */
  dirty = true;
  /** The last refresh threw. The node stays dirty and passes on every notification. */
  failed = false;
  /** Epoch of the last successful refresh. */
  seen = -1;
  init = false;
  computing = false;

  constructor(private fn: () => T, private eq: Eq<T> = Object.is) {}

  notify(): void {
    if (this.dirty && !this.failed) return;
    this.dirty = true;
    for (const t of this.targets) t.notify();
  }

  onFirstTarget(): void {
    let ok = false;
    try {
      this.refresh();
      ok = true;
    } catch {
      // Rethrown to whoever reads the node.
    }
    for (let i = 0; i < this.deps.length; i++) linkTo(this, this.deps[i]);
    this.linked = true;
    this.dirty = !ok;
  }

  onLastTarget(): void {
    this.linked = false;
    for (let i = 0; i < this.deps.length; i++) unlinkFrom(this, this.deps[i]);
    this.dirty = true;
  }

  refresh(): void {
    if (this.linked) {
      if (!this.dirty) return;
    } else if (this.init && !this.failed && this.seen === epoch) {
      return;
    }
    if (DEV && this.computing) throw new Error('cycle detected among derived signals');
    try {
      if (this.init && !this.failed && !depsChanged(this.deps, this.versions)) {
        this.dirty = false;
        this.seen = epoch;
        return;
      }
      this.recompute();
      this.failed = false;
    } catch (e) {
      this.failed = true;
      this.dirty = true;
      throw e;
    }
  }

  private recompute(): void {
    const prevOwner = owner;
    const prev = startCapture(this);
    this.computing = true;
    owner = null;
    inDerived++;
    let v: T = UNSET;
    let error: unknown = null;
    let ok = false;
    try {
      v = this.fn();
      ok = true;
    } catch (e) {
      error = e;
    } finally {
      current = prev;
      owner = prevOwner;
      inDerived--;
      this.computing = false;
    }
    // Keep what was read, even on failure, so the node hears about changes.
    if (this.linked) relink(this, this.deps, this.newDeps);
    this.deps = this.newDeps;
    this.versions = this.newVersions;
    this.newDeps = [];
    this.newVersions = [];
    if (!ok) throw error;
    if (!this.init || !this.eq(v, this.value)) {
      this.value = v;
      this.version++;
    }
    this.init = true;
    this.dirty = false;
    this.seen = epoch;
  }

  read(): T {
    try {
      this.refresh();
    } finally {
      track(this);
    }
    return this.value;
  }
}

export function derived<T>(fn: () => T, eq?: Eq<T>): Derived<T> {
  return new Derived(fn, eq);
}

// ---------------------------------------------------------------------------
// Reading

/** Anything with a tracked `read`. */
export interface Readable<T> extends Source<T> {
  read(): T;
}

/** Read without recording a dependency. */
export function sample<T>(s: Readable<T>): T {
  const prev = current;
  current = null;
  try {
    return s.read();
  } finally {
    current = prev;
  }
}

/** Run `fn` without recording dependencies. */
export function untracked<T>(fn: () => T): T {
  const prev = current;
  current = null;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

// ---------------------------------------------------------------------------
// Combinators over readables

export function map<A, B>(f: (a: A) => B, s: Readable<A>): Readable<B> {
  if (s instanceof Constant) return constant(f(s.value));
  return derived(() => f(s.read()));
}

export function apply<A, B>(sf: Readable<(a: A) => B>, sa: Readable<A>): Readable<B> {
  if (sf instanceof Constant && sa instanceof Constant) return constant(sf.value(sa.value));
  return derived(() => sf.read()(sa.read()));
}

/**
 * Monadic bind with dynamic dependencies. The inner signal is rebuilt only
 * when the outer signal's version changes, so stateful inner signals keep
 * their state while the outer value stays put.
 */
export function bind<A, B>(s: Readable<A>, f: (a: A) => Readable<B>): Readable<B> {
  let outerVersion = -1;
  let inner: Readable<B> | null = null;
  return derived(() => {
    const a = s.read();
    if (inner === null || s.version !== outerVersion) {
      outerVersion = s.version;
      inner = f(a);
    }
    return inner.read();
  });
}

/** Re-emits `s` with a different cutoff equality. */
export function dropRepeatsBy<A>(eq: Eq<A>, s: Readable<A>): Readable<A> {
  return derived(() => s.read(), eq);
}

// ---------------------------------------------------------------------------
// Scopes

export type ErrorHandler = (error: unknown) => void;

export class Scope {
  cleanups: (() => void)[] = [];
  children: Set<Scope> = new Set();
  disposed = false;
  onError: ErrorHandler | null = null;
  constructor(public parent: Scope | null) {
    if (parent !== null) {
      if (parent.disposed) throw new Error('scope created under a disposed scope');
      parent.children.add(this);
    }
    if (DEV) stats.liveScopes++;
  }

  /** Dispose children (newest first), then run own cleanups in reverse order. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (DEV) stats.liveScopes--;
    if (this.parent !== null) this.parent.children.delete(this);
    const children = [...this.children].reverse();
    this.children.clear();
    let error: unknown = null;
    let failed = false;
    for (const c of children) {
      try {
        c.dispose();
      } catch (e) {
        if (!failed) { error = e; failed = true; }
      }
    }
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        cleanups[i]();
      } catch (e) {
        if (!failed) { error = e; failed = true; }
      }
    }
    if (failed) throw error;
  }
}

export function createScope(parent: Scope | null = owner): Scope {
  return new Scope(parent);
}

/** Run `fn` with `s` as the owner of new effects. Dependencies are not captured. */
export function runInScope<T>(s: Scope, fn: () => T): T {
  if (s.disposed) throw new Error('running in a disposed scope');
  const prevOwner = owner;
  const prev = current;
  owner = s;
  current = null;
  try {
    return fn();
  } finally {
    owner = prevOwner;
    current = prev;
  }
}

/** Create a child scope of the current owner (or a root), run `fn` in it, and return its disposer. */
export function scope(fn: (s: Scope) => void, parent: Scope | null = owner): () => void {
  const s = new Scope(parent);
  batch(() => runInScope(s, () => fn(s)));
  return disposerOf(s);
}

// A separate function, so the disposer's closure does not share a context
// with (and retain) the setup function.
function disposerOf(s: Scope): () => void {
  return () => s.dispose();
}

export function getOwner(): Scope | null {
  return owner;
}

export function onCleanup(f: () => void): void {
  if (owner === null) throw new Error('onCleanup outside a scope');
  owner.cleanups.push(f);
}

/** Report an error to the nearest error handler, or rethrow it when the flush completes. */
export function reportError(s: Scope | null, error: unknown): void {
  for (let x = s; x !== null; x = x.parent) {
    if (x.onError !== null) {
      try {
        x.onError(error);
        return;
      } catch (e) {
        error = e;
      }
    }
  }
  pendingErrors.push(error);
}

// ---------------------------------------------------------------------------
// Effects

export class EffectNode implements Target, Computation {
  id = nextEffectId++;
  deps: Source[] = [];
  versions: number[] = [];
  newDeps: Source[] = [];
  newVersions: number[] = [];
  runMark = 0;
  nested = false;
  queued = false;
  disposed = false;

  constructor(private fn: () => void, public scope: Scope) {}

  notify(): void {
    if (this.queued || this.disposed) return;
    this.queued = true;
    queue.push(this);
  }

  stale(): boolean {
    try {
      return depsChanged(this.deps, this.versions);
    } catch {
      // A dependency threw; run so the error is reported through this effect.
      return true;
    }
  }

  run(): void {
    if (this.disposed) return;
    if (DEV) stats.effectRuns++;
    const prevOwner = owner;
    const prev = startCapture(this);
    owner = null;
    try {
      this.fn();
    } catch (e) {
      reportError(this.scope, e);
    } finally {
      current = prev;
      owner = prevOwner;
    }
    if (this.disposed) {
      this.newDeps = [];
      this.newVersions = [];
      return;
    }
    relink(this, this.deps, this.newDeps);
    this.deps = this.newDeps;
    this.versions = this.newVersions;
    this.newDeps = [];
    this.newVersions = [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (DEV) stats.liveEffects--;
    const deps = this.deps;
    this.deps = [];
    this.versions = [];
    for (let i = 0; i < deps.length; i++) unlinkFrom(this, deps[i]);
  }
}

/**
 * Create an effect owned by the current scope and run it once. Writes made
 * while it runs are queued into the next flush round.
 */
export function effect(fn: () => void): EffectNode {
  const s = owner;
  if (s === null) throw new Error('effect outside a scope');
  if (s.disposed) throw new Error('effect created in a disposed scope');
  const e = new EffectNode(fn, s);
  if (DEV) stats.liveEffects++;
  s.cleanups.push(() => e.dispose());
  batchDepth++;
  try {
    e.run();
  } finally {
    if (--batchDepth === 0) flush();
  }
  return e;
}

// ---------------------------------------------------------------------------
// Batching

/** Run `f`; effects triggered by its writes run once when the outermost batch returns. */
export function batch<T>(f: () => T): T {
  batchDepth++;
  try {
    return f();
  } finally {
    if (--batchDepth === 0) flush();
  }
}

export function isBatching(): boolean {
  return batchDepth > 0;
}

function flush(): void {
  let rounds = 0;
  batchDepth++;
  try {
    while (queue.length > 0) {
      if (++rounds > LOOP_LIMIT) {
        for (const e of queue) e.queued = false;
        queue = [];
        throw new Error('effect loop');
      }
      const es = queue;
      queue = [];
      es.sort((x, y) => x.id - y.id);
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        e.queued = false;
        if (!e.disposed && e.stale()) e.run();
      }
    }
  } finally {
    batchDepth--;
  }
  if (pendingErrors.length > 0) {
    const errors = pendingErrors;
    pendingErrors = [];
    for (let i = 1; i < errors.length; i++) console.error(errors[i]);
    throw errors[0];
  }
}
