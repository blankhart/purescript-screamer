// Screamer's reactive core.
//
// Four kinds of signal node, plus event nodes; only effects have owners.
//
// - Cells are sources. They hold their observers only while observed.
// - Derived nodes are lazy: they link to their sources only while something
//   observes them, so allocating one has no effect on the graph and an
//   unobserved derived node can be garbage-collected.
// - Stateful nodes keep state in the node and step only while observed.
// - Effects are always linked while alive and belong to a scope, which
//   disposes them.
// - Event nodes (see "Events" below) carry the occurrences of one round
//   instead of a current value, and have no cutoff.
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
/**
 * Nodes that lost their last target during a batch. They unlink when the
 * batch ends unless something observes them again first, so a node that
 * changes observers within one batch neither pauses nor resynchronizes.
 */
let pendingUnobserved: Source[] = [];
/** Global fire counter: every occurrence gets the next stamp. */
let stamp = 0;
/** The stamp of the current round's start, given to occurrences of `changes`. */
let roundStamp = 0;
/** Greater than zero while the flush loop runs. */
let flushing = 0;
/** Event sources fired since the last round started. */
let fired: EventSourceNode<any>[] = [];
/**
 * Stateful nodes over events that were notified and may not have stepped
 * yet. They step at the end of the round, before the next one replaces
 * their inputs' occurrences.
 */
let unsettled: Settle[] = [];

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
  if (dep.targets.size === 0 && dep.onLastTarget) {
    if (batchDepth > 0) pendingUnobserved.push(dep);
    else dep.onLastTarget();
  }
}

function releaseUnobserved(): void {
  while (pendingUnobserved.length > 0) {
    const ps = pendingUnobserved;
    pendingUnobserved = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.targets.size === 0) p.onLastTarget!();
    }
  }
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
    if (this.linked) return; // still linked: its release was deferred
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
    if (!this.linked) return;
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
// Stateful nodes
//
// Stateful signals advance only while observed.
//
// - Start. State begins at the seed (for `merge`, the left input's current
//   value). Values the input held before observation are not stepped over.
// - Step. One step per propagation in which an input changed. Writes inside
//   one batch coalesce, so two writes in one handler step a `fold` once.
// - Pause. When the last observer goes, the node unlinks and keeps its state.
//   `read` returns that state. When observed again it resynchronizes with its
//   inputs without stepping, then continues.
// - Simultaneity. When both inputs of `merge` change in one batch, the left
//   wins (like Reflex's `leftmost`).
//
// Guarantee: two evaluations of the same stateful expression produce the
// same values whenever they are observed over the same interval. Where a
// program needs one state regardless of who observes it, `hold` observes the
// signal for the lifetime of the current scope and returns the same node.

export type Step<S> = (changed: boolean[], values: any[], state: S) => S;

/** A stateful node that must step in the round its event inputs fired. */
interface Settle {
  linked: boolean;
  dirty: boolean;
  refresh(): void;
}

export class Stateful<S> implements Source<S>, Target, Settle {
  value: S = UNSET;
  version = 0;
  targets: Set<Target> = new Set();
  _track = 0;
  _diff = 0;
  started = false;
  linked = false;
  dirty = true;
  failed = false;
  /** Input versions at the last step or resynchronization. */
  last: number[];
  /** Some input is an event, whose occurrences last one round. */
  private settles: boolean;

  constructor(
    public inputs: Source<any>[],
    private initial: () => S,
    private step: Step<S>,
    private eq: Eq<S> = Object.is,
  ) {
    this.last = inputs.map(() => -1);
    this.settles = inputs.some(isEvent);
  }

  notify(): void {
    if (this.dirty && !this.failed) return;
    this.dirty = true;
    if (this.settles) unsettled.push(this);
    for (const t of this.targets) t.notify();
  }

  private start(): void {
    this.value = pure(this.initial);
    this.started = true;
    this.version++;
  }

  onFirstTarget(): void {
    if (this.linked) return; // still linked: its release was deferred
    let ok = false;
    try {
      if (!this.started) this.start();
      // Resynchronize: record input versions without stepping.
      for (let i = 0; i < this.inputs.length; i++) {
        const d = this.inputs[i];
        d.refresh();
        this.last[i] = d.version;
      }
      ok = true;
    } catch {
      // Rethrown to whoever reads the node.
    }
    for (let i = 0; i < this.inputs.length; i++) linkTo(this, this.inputs[i]);
    this.linked = true;
    this.dirty = !ok;
    this.failed = !ok;
  }

  onLastTarget(): void {
    if (!this.linked) return;
    this.linked = false;
    for (let i = 0; i < this.inputs.length; i++) unlinkFrom(this, this.inputs[i]);
    this.dirty = true;
  }

  refresh(): void {
    if (!this.linked) {
      // Paused: keep the state.
      if (!this.started) this.start();
      return;
    }
    if (!this.dirty) return;
    try {
      if (!this.started) this.start();
      const n = this.inputs.length;
      const changed: boolean[] = new Array(n);
      const versions: number[] = new Array(n);
      let any = false;
      for (let i = 0; i < n; i++) {
        const d = this.inputs[i];
        d.refresh();
        versions[i] = d.version;
        changed[i] = d.version !== this.last[i];
        if (changed[i]) any = true;
      }
      if (any) {
        if (DEV) stats.steps++;
        const values = this.inputs.map((d) => d.value);
        const state = this.value;
        const v = pure(() => this.step(changed, values, state));
        if (!this.eq(v, this.value)) {
          this.value = v;
          this.version++;
        }
      }
      this.last = versions;
      this.dirty = false;
      this.failed = false;
    } catch (e) {
      this.dirty = true;
      this.failed = true;
      throw e;
    }
  }

  read(): S {
    try {
      this.refresh();
    } finally {
      track(this);
    }
    return this.value;
  }
}

/** Run a pure function: untracked, with no owner, and with writes rejected. */
function pure<T>(fn: () => T): T {
  const prev = current;
  const prevOwner = owner;
  current = null;
  owner = null;
  inDerived++;
  try {
    return fn();
  } finally {
    current = prev;
    owner = prevOwner;
    inDerived--;
  }
}

export function stateful<S>(inputs: Source<any>[], initial: () => S, step: Step<S>, eq?: Eq<S>): Stateful<S> {
  return new Stateful(inputs, initial, step, eq);
}

/** Accumulate `s` from `seed`, one step per batch in which `s` changed, while observed. */
export function fold<A, B>(f: (a: A, b: B) => B, seed: B, s: Readable<A>): Readable<B> {
  return stateful([s], () => seed, (_, values, b) => f(values[0], b));
}

/**
 * The latest of `a` and `b`, starting at `a`'s current value; `a` wins when
 * both change in one batch. A merge reports every step, even one that repeats
 * its value, so nested merges agree on which input changed and `<|>` stays
 * associative.
 */
export function merge<A>(a: Readable<A>, b: Readable<A>): Readable<A> {
  return stateful([a, b], () => a.read(), (changed, values) => (changed[0] ? values[0] : values[1]), never);
}

const never = () => false;

/** Values of `s` that satisfy `p`, starting at `seed` unless `s` satisfies `p` at the start. */
export function filter<A>(p: (a: A) => boolean, seed: A, s: Readable<A>): Readable<A> {
  return stateful([s], () => {
    const v = s.read();
    return p(v) ? v : seed;
  }, (_, values, prev) => (p(values[0]) ? values[0] : prev));
}

/**
 * Follows `s` while `cond` is true and holds its last value while `cond` is
 * false. When `cond` becomes true, it takes `s`'s current value. Starts at
 * `s` if `cond` is true at the start, otherwise at `seed`.
 */
export function filterOn<A>(cond: Readable<boolean>, seed: A, s: Readable<A>): Readable<A> {
  return stateful([cond, s], () => (cond.read() ? s.read() : seed), (_, values, prev) => (values[0] ? values[1] : prev));
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

/** Something a scope disposes: a cleanup function or an object with `dispose`. */
export type Cleanup = (() => void) | { dispose(): void };

export class Scope {
  cleanups: Cleanup[] = [];
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
    let error: unknown = null;
    let failed = false;
    if (this.children.size > 0) {
      const children = Array.from(this.children);
      this.children.clear();
      for (let i = children.length - 1; i >= 0; i--) {
        try {
          children[i].dispose();
        } catch (e) {
          if (!failed) { error = e; failed = true; }
        }
      }
    }
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try {
        const c = cleanups[i];
        if (typeof c === 'function') c();
        else c.dispose();
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

export function onCleanup(f: Cleanup): void {
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
  return effectIn(s, fn);
}

/** Create an effect owned by `s` and run it once. */
export function effectIn(s: Scope, fn: () => void): EffectNode {
  if (s.disposed) throw new Error('effect created in a disposed scope');
  const e = new EffectNode(fn, s);
  if (DEV) stats.liveEffects++;
  s.cleanups.push(e);
  batchDepth++;
  try {
    e.run();
  } finally {
    if (--batchDepth === 0) flush();
  }
  return e;
}

/** Keep `s` observed for the lifetime of the current scope, and return it. */
export function hold<T>(s: Readable<T>): Readable<T> {
  effect(() => { s.read(); });
  return s;
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
  let loopError: unknown = null;
  batchDepth++;
  flushing++;
  try {
    while (queue.length > 0 || fired.length > 0) {
      if (++rounds > LOOP_LIMIT) {
        for (const e of queue) e.queued = false;
        queue = [];
        for (const src of fired) src.pending = [];
        fired = [];
        loopError = new Error('effect loop');
        break;
      }
      startRound();
      const es = queue;
      queue = [];
      es.sort((x, y) => x.id - y.id);
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        e.queued = false;
        if (!e.disposed && e.stale()) e.run();
      }
      settle();
    }
  } finally {
    batchDepth--;
    flushing--;
  }
  releaseUnobserved();
  if (loopError !== null) {
    pendingErrors = [];
    throw loopError;
  }
  if (pendingErrors.length > 0) {
    const errors = pendingErrors;
    pendingErrors = [];
    for (let i = 1; i < errors.length; i++) console.error(errors[i]);
    throw errors[0];
  }
}

// ---------------------------------------------------------------------------
// Events
//
// An event node carries occurrences instead of a current value. Its `value`
// is the list of occurrences it produced when its version last increased,
// each stamped with the global fire counter, in fire order. The version
// increases only when a computation produces at least one occurrence, so
// there is no cutoff and no "unchanged" value.
//
// Consumers take occurrences by version: a consumer that recorded version v
// of an input and now sees a different version takes the input's current
// list, and otherwise takes nothing. So each consumer sees each occurrence
// once, however many times it is read.
//
// - Rounds. `fire` queues an occurrence on its source. Each pass of the flush
//   loop starts a round: queued occurrences become their sources' values
//   (one version step per source per round) and observers are notified.
//   Occurrences fired while a round runs belong to the next round.
// - Laziness. Derived event nodes link to their inputs only while observed.
//   When observed again they resynchronize: they record their inputs'
//   versions and produce nothing, so occurrences from before observation are
//   never delivered.
// - Settling. A stateful node over events (`stepper`, `Event.fold`, `take`)
//   steps in the round its inputs fired, before the next round replaces
//   their occurrences, even if no effect reads it in that round.

/** One occurrence: its fire stamp and value. */
export interface Occ<T> {
  s: number;
  v: T;
}

/** An event node: a source whose value is the occurrences of its last step. */
export interface EventLike<T> extends Source<Occ<T>[]> {
  isEvent: true;
}

const NONE: Occ<any>[] = [];

function isEvent(n: Source): boolean {
  return (n as any).isEvent === true;
}

/** Refresh `n` and record it as a dependency of the current computation. */
export function touch(n: Source): void {
  try {
    n.refresh();
  } finally {
    track(n);
  }
}

/** Step every stateful node over events that is still waiting to. */
function settle(): void {
  while (unsettled.length > 0) {
    const ns = unsettled;
    unsettled = [];
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (n.linked && n.dirty) {
        try {
          n.refresh();
        } catch {
          // Rethrown to whoever reads the node.
        }
      }
    }
  }
}

/** Start a round: deliver the occurrences fired since the last one. */
function startRound(): void {
  roundStamp = ++stamp;
  if (fired.length === 0) return;
  const fs = fired;
  fired = [];
  epoch++;
  for (let i = 0; i < fs.length; i++) {
    const src = fs[i];
    src.value = src.pending;
    src.pending = [];
    src.version++;
  }
  for (let i = 0; i < fs.length; i++) {
    for (const t of fs[i].targets) t.notify();
  }
}

export class EventSourceNode<T> implements EventLike<T> {
  readonly isEvent = true;
  value: Occ<T>[] = NONE;
  version = 0;
  targets: Set<Target> = new Set();
  _track = 0;
  _diff = 0;
  /** Occurrences fired since the last round started. */
  pending: Occ<T>[] = [];

  refresh(): void {}

  /** Add an occurrence. It is delivered when the next round starts. */
  fire(x: T): void {
    if (DEV && inDerived > 0) throw new Error('fire inside a derivation');
    // Nothing observes the event, so the occurrence goes nowhere.
    if (this.targets.size === 0) return;
    if (this.pending.length === 0) fired.push(this);
    this.pending.push({ s: ++stamp, v: x });
    if (batchDepth === 0) flush();
  }
}

export function eventSource<T>(): EventSourceNode<T> {
  return new EventSourceNode<T>();
}

/** The event that never fires. */
export const neverEvent: EventLike<any> = new EventSourceNode<any>();

/** What an event computation can ask about its inputs. */
export interface Inputs {
  /** The input's occurrences that this computation has not seen yet. */
  occ<X>(e: EventLike<X>): Occ<X>[];
  /** Whether the signal changed since this computation last read it. False on first read. */
  changed(s: Source<any>): boolean;
}

/**
 * A stateless event node with dynamic dependencies. Its function reads
 * events through `occ`, and signals through `read` as usual, and returns
 * this round's occurrences.
 */
export class EventDerived<T> implements EventLike<T>, Target, Computation, Inputs {
  readonly isEvent = true;
  value: Occ<T>[] = NONE;
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
  linked = false;
  dirty = true;
  failed = false;
  init = false;
  computing = false;
  /** Resynchronizing: record the inputs' versions and produce nothing. */
  private quiet = false;

  constructor(private fn: (inputs: Inputs) => Occ<T>[]) {}

  notify(): void {
    if (this.dirty && !this.failed) return;
    this.dirty = true;
    for (const t of this.targets) t.notify();
  }

  onFirstTarget(): void {
    if (this.linked) return; // still linked: its release was deferred
    let ok = false;
    try {
      this.recompute(true);
      ok = true;
    } catch {
      // Rethrown to whoever reads the node.
    }
    for (let i = 0; i < this.deps.length; i++) linkTo(this, this.deps[i]);
    this.linked = true;
    this.dirty = !ok;
    this.failed = !ok;
  }

  onLastTarget(): void {
    if (!this.linked) return;
    this.linked = false;
    for (let i = 0; i < this.deps.length; i++) unlinkFrom(this, this.deps[i]);
    this.dirty = true;
  }

  refresh(): void {
    if (this.linked && !this.dirty) return;
    if (DEV && this.computing) throw new Error('cycle detected among derived events');
    try {
      if (this.init && !this.failed && !depsChanged(this.deps, this.versions)) {
        this.dirty = false;
        return;
      }
      this.recompute(false);
      this.failed = false;
    } catch (e) {
      this.failed = true;
      this.dirty = true;
      throw e;
    }
  }

  /** The version this computation recorded for `n` last time, or -1. */
  private seen(n: Source): number {
    const i = this.deps.indexOf(n);
    return i < 0 ? -1 : this.versions[i];
  }

  occ<X>(e: EventLike<X>): Occ<X>[] {
    touch(e);
    if (this.quiet) return NONE;
    const v = this.seen(e);
    return v < 0 || v === e.version ? NONE : e.value;
  }

  changed(s: Source<any>): boolean {
    touch(s);
    if (this.quiet) return false;
    const v = this.seen(s);
    return v >= 0 && v !== s.version;
  }

  private recompute(quiet: boolean): void {
    const prevOwner = owner;
    const prev = startCapture(this);
    this.computing = true;
    this.quiet = quiet;
    owner = null;
    inDerived++;
    let v: Occ<T>[] = NONE;
    let error: unknown = null;
    let ok = false;
    try {
      v = this.fn(this);
      ok = true;
    } catch (e) {
      error = e;
    } finally {
      current = prev;
      owner = prevOwner;
      inDerived--;
      this.computing = false;
      this.quiet = false;
    }
    if (this.linked) relink(this, this.deps, this.newDeps);
    this.deps = this.newDeps;
    this.versions = this.newVersions;
    this.newDeps = [];
    this.newVersions = [];
    if (!ok) throw error;
    this.init = true;
    this.dirty = false;
    if (quiet || v.length === 0) {
      this.value = NONE;
    } else {
      this.value = v;
      this.version++;
    }
  }
}

export function eventDerived<T>(fn: (inputs: Inputs) => Occ<T>[]): EventDerived<T> {
  return new EventDerived(fn);
}

/** The result of one step of a stateful event node. */
export interface EventStep<S, T> {
  state: S;
  out: Occ<T>[];
}

/**
 * A stateful event node: like `Stateful`, but each step produces
 * occurrences. It starts from `initial` when first observed, steps once per
 * round in which an input changed, keeps its state while paused and
 * resynchronizes without stepping when observed again.
 */
export class EventStateful<S, T> implements EventLike<T>, Target, Settle {
  readonly isEvent = true;
  value: Occ<T>[] = NONE;
  version = 0;
  targets: Set<Target> = new Set();
  _track = 0;
  _diff = 0;
  state: S = UNSET;
  started = false;
  linked = false;
  dirty = true;
  failed = false;
  last: number[];

  constructor(
    public inputs: Source<any>[],
    private initial: () => S,
    private step: (changed: boolean[], values: any[], state: S) => EventStep<S, T>,
    /** The state to keep while paused; by default all of it. */
    private pause?: (state: S) => S,
  ) {
    this.last = inputs.map(() => -1);
  }

  notify(): void {
    if (this.dirty && !this.failed) return;
    this.dirty = true;
    unsettled.push(this);
    for (const t of this.targets) t.notify();
  }

  onFirstTarget(): void {
    if (this.linked) return; // still linked: its release was deferred
    let ok = false;
    try {
      if (!this.started) {
        this.state = pure(this.initial);
        this.started = true;
      }
      for (let i = 0; i < this.inputs.length; i++) {
        const d = this.inputs[i];
        d.refresh();
        this.last[i] = d.version;
      }
      ok = true;
    } catch {
      // Rethrown to whoever reads the node.
    }
    this.value = NONE;
    for (let i = 0; i < this.inputs.length; i++) linkTo(this, this.inputs[i]);
    this.linked = true;
    this.dirty = !ok;
    this.failed = !ok;
  }

  onLastTarget(): void {
    if (!this.linked) return;
    this.linked = false;
    for (let i = 0; i < this.inputs.length; i++) unlinkFrom(this, this.inputs[i]);
    this.dirty = true;
    if (this.pause && this.started) this.state = this.pause(this.state);
  }

  refresh(): void {
    // Paused: produce nothing and keep the state.
    if (!this.linked || !this.dirty) return;
    try {
      if (!this.started) {
        this.state = pure(this.initial);
        this.started = true;
      }
      const n = this.inputs.length;
      const changed: boolean[] = new Array(n);
      const versions: number[] = new Array(n);
      let any = false;
      for (let i = 0; i < n; i++) {
        const d = this.inputs[i];
        d.refresh();
        versions[i] = d.version;
        changed[i] = d.version !== this.last[i];
        if (changed[i]) any = true;
      }
      if (any) {
        if (DEV) stats.steps++;
        const values = this.inputs.map((d) => d.value);
        const state = this.state;
        const r = pure(() => this.step(changed, values, state));
        this.state = r.state;
        if (r.out.length > 0) {
          this.value = r.out;
          this.version++;
        } else {
          this.value = NONE;
        }
      }
      this.last = versions;
      this.dirty = false;
      this.failed = false;
    } catch (e) {
      this.dirty = true;
      this.failed = true;
      throw e;
    }
  }
}

export function eventStateful<S, T>(
  inputs: Source<any>[],
  initial: () => S,
  step: (changed: boolean[], values: any[], state: S) => EventStep<S, T>,
  pause?: (state: S) => S,
): EventStateful<S, T> {
  return new EventStateful(inputs, initial, step, pause);
}

/** One step of `accumEvent`: the new state, and the occurrence to emit, if any. */
export interface Accum<S, B> {
  state: S;
  emit: boolean;
  value?: B;
}

/**
 * A per-occurrence state machine over one event: `f` sees each occurrence
 * in order with the current state, and may emit one occurrence for it, with
 * its stamp. Stateful: starts from `seed()` when first observed and steps
 * only while observed.
 */
export function accumEvent<A, S, B>(f: (a: A, s: S) => Accum<S, B>, seed: () => S, e: EventLike<A>): EventLike<B> {
  return eventStateful<S, B>([e], seed, (_, values, state) => {
    const os: Occ<A>[] = values[0];
    const out: Occ<B>[] = [];
    for (let i = 0; i < os.length; i++) {
      const r = f(os[i].v, state);
      state = r.state;
      if (r.emit) out.push({ s: os[i].s, v: r.value as B });
    }
    return { state, out };
  });
}

/** Occurrences of both lists in stamp order; the left goes first on equal stamps. */
export function interleave<T>(a: Occ<T>[], b: Occ<T>[]): Occ<T>[] {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out: Occ<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (b[j].s < a[i].s) out.push(b[j++]);
    else out.push(a[i++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

export function mapEvent<A, B>(f: (a: A) => B, e: EventLike<A>): EventLike<B> {
  if (e === neverEvent) return neverEvent;
  return eventDerived((r) => {
    const os = r.occ(e);
    if (os.length === 0) return NONE;
    const out = new Array<Occ<B>>(os.length);
    for (let i = 0; i < os.length; i++) out[i] = { s: os[i].s, v: f(os[i].v) };
    return out;
  });
}

export function filterMapEvent<A, B>(f: (a: A) => { ok: boolean; v?: B }, e: EventLike<A>): EventLike<B> {
  return eventDerived((r) => {
    const os = r.occ(e);
    const out: Occ<B>[] = [];
    for (let i = 0; i < os.length; i++) {
      const x = f(os[i].v);
      if (x.ok) out.push({ s: os[i].s, v: x.v as B });
    }
    return out;
  });
}

export function filterEvent<A>(p: (a: A) => boolean, e: EventLike<A>): EventLike<A> {
  return eventDerived((r) => {
    const os = r.occ(e);
    const out: Occ<A>[] = [];
    for (let i = 0; i < os.length; i++) if (p(os[i].v)) out.push(os[i]);
    return out.length === os.length ? os : out;
  });
}

/** Both events' occurrences in fire order; neither is dropped. */
export function alt<A>(a: EventLike<A>, b: EventLike<A>): EventLike<A> {
  if (a === neverEvent) return b;
  if (b === neverEvent) return a;
  return eventDerived((r) => interleave(r.occ(a), r.occ(b)));
}

/**
 * The stamp for an occurrence caused by a signal's change: the current
 * round's start, after every fire of the round, or a fresh stamp outside a
 * flush.
 */
export function signalStamp(): number {
  return flushing > 0 ? roundStamp : ++stamp;
}

/** An occurrence with the signal's new value in each round in which it changed. */
export function changes<A>(s: Readable<A>): EventLike<A> {
  return eventDerived((r) => (r.changed(s) ? [{ s: signalStamp(), v: s.value }] : NONE));
}

/** The latest occurrence, starting at `seed`. Stateful: steps only while observed. */
export function stepper<A>(seed: A, e: EventLike<A>): Readable<A> {
  return stateful([e], () => seed, (_, values) => {
    const os: Occ<A>[] = values[0];
    return os[os.length - 1].v;
  });
}

/** Accumulate from `seed`, one step per occurrence. */
export function foldEvent<A, B>(f: (a: A, b: B) => B, seed: B, e: EventLike<A>): Readable<B> {
  return stateful([e], () => seed, (_, values, b) => {
    const os: Occ<A>[] = values[0];
    for (let i = 0; i < os.length; i++) b = f(os[i].v, b);
    return b;
  });
}

/** Each occurrence combined with the signal's value at the end of the round. */
export function attachWith<A, B, C>(f: (b: B, a: A) => C, s: Readable<B>, e: EventLike<A>): EventLike<C> {
  return eventDerived((r) => {
    const b = s.read();
    const os = r.occ(e);
    if (os.length === 0) return NONE;
    const out = new Array<Occ<C>>(os.length);
    for (let i = 0; i < os.length; i++) out[i] = { s: os[i].s, v: f(b, os[i].v) };
    return out;
  });
}

// ---------------------------------------------------------------------------
// Combining several streams (#20)

/** All the inputs' occurrences in stamp order; on equal stamps, earlier inputs first. */
export function oneOf<A>(es: EventLike<A>[]): EventLike<A> {
  const ins = es.filter((e) => e !== neverEvent);
  if (ins.length === 0) return neverEvent;
  if (ins.length === 1) return ins[0];
  return eventDerived((r) => {
    let out: Occ<A>[] = NONE;
    let lists = 0;
    for (let i = 0; i < ins.length; i++) {
      const os = r.occ(ins[i]);
      if (os.length === 0) continue;
      out = lists === 0 ? os : out.concat(os);
      lists++;
    }
    // A stable sort keeps earlier inputs first on equal stamps.
    return lists > 1 ? out.slice().sort((x, y) => x.s - y.s) : out;
  });
}

/** The occurrences of the leftmost input that fired in the round. */
export function leftmost<A>(es: EventLike<A>[]): EventLike<A> {
  return eventDerived((r) => {
    let out: Occ<A>[] = NONE;
    // Read every input, so each records its version and stays linked.
    for (let i = 0; i < es.length; i++) {
      const os = r.occ(es[i]);
      if (out.length === 0) out = os;
    }
    return out;
  });
}

/**
 * Both events' occurrences in stamp order. An occurrence of each with the
 * same stamp (both derived from one fire) are combined with `both`.
 */
export function mergeWith<A, B, C>(
  both: (a: A, b: B) => C,
  left: (a: A) => C,
  right: (b: B) => C,
  ea: EventLike<A>,
  eb: EventLike<B>,
): EventLike<C> {
  return eventDerived((r) => {
    const as = r.occ(ea);
    const bs = r.occ(eb);
    if (as.length === 0 && bs.length === 0) return NONE;
    const out: Occ<C>[] = [];
    let i = 0;
    let j = 0;
    while (i < as.length || j < bs.length) {
      if (j >= bs.length || (i < as.length && as[i].s < bs[j].s)) {
        out.push({ s: as[i].s, v: left(as[i].v) });
        i++;
      } else if (i >= as.length || bs[j].s < as[i].s) {
        out.push({ s: bs[j].s, v: right(bs[j].v) });
        j++;
      } else {
        out.push({ s: as[i].s, v: both(as[i].v, bs[j].v) });
        i++;
        j++;
      }
    }
    return out;
  });
}

interface ZipState<A, B> {
  as: Occ<A>[];
  bs: Occ<B>[];
}

/**
 * Pairs the nth occurrence of `ea` with the nth of `eb`, counting from when
 * it is observed. Unpaired occurrences queue without bound. A paused zip
 * drops its queues, because what they would be paired with is missed.
 */
export function zip<A, B, C>(f: (a: A, b: B) => C, ea: EventLike<A>, eb: EventLike<B>): EventLike<C> {
  return eventStateful<ZipState<A, B>, C>(
    [ea, eb],
    () => ({ as: [], bs: [] }),
    (changed, values, st) => {
      // Take the round's occurrences in stamp order, pairing as they come.
      const as = changed[0] ? (values[0] as Occ<A>[]) : NONE;
      const bs = changed[1] ? (values[1] as Occ<B>[]) : NONE;
      const qa = st.as.slice();
      const qb = st.bs.slice();
      const out: Occ<C>[] = [];
      let i = 0;
      let j = 0;
      while (i < as.length || j < bs.length) {
        const takeA = j >= bs.length || (i < as.length && as[i].s <= bs[j].s);
        if (takeA) {
          const o = as[i++];
          if (qb.length > 0) out.push({ s: o.s, v: f(o.v, qb.shift()!.v) });
          else qa.push(o);
        } else {
          const o = bs[j++];
          if (qa.length > 0) out.push({ s: o.s, v: f(qa.shift()!.v, o.v) });
          else qb.push(o);
        }
      }
      return { state: { as: qa, bs: qb }, out };
    },
    () => ({ as: [], bs: [] }),
  );
}

/**
 * Follows the first input to fire after it is first observed (the leftmost,
 * if several fire in that round), and ignores the others from then on.
 */
export function race<A>(es: EventLike<A>[]): EventLike<A> {
  return eventStateful<number, A>(es, () => -1, (changed, values, winner) => {
    if (winner < 0) winner = changed.indexOf(true);
    return { state: winner, out: winner >= 0 && changed[winner] ? values[winner] : NONE };
  });
}

/** The current values of all the signals, as one node. */
export function combine<A>(ss: Readable<A>[]): Readable<A[]> {
  if (ss.every((s) => s instanceof Constant)) return constant(ss.map((s) => s.value));
  return derived(() => {
    const out = new Array<A>(ss.length);
    for (let i = 0; i < ss.length; i++) out[i] = ss[i].read();
    return out;
  });
}

/**
 * `a`'s value paired with `b`'s, changing only when `a` changes. `b` is
 * observed with it, so a stateful `b` keeps advancing.
 */
export function withLatest<A, B, T>(pair: (a: A, b: B) => T, b: Readable<B>, a: Readable<A>): Readable<T> {
  return stateful<T>([a, b], () => pair(a.read(), b.read()), (changed, values, prev) =>
    (changed[0] ? pair(values[0], values[1]) : prev));
}

// ---------------------------------------------------------------------------
// Flattening (#21)

/**
 * The occurrences of whichever event the signal holds. When the signal
 * changes, the new event is followed from then on: it delivers nothing
 * fired before it was switched to.
 */
export function switchEvent<A>(s: Readable<EventLike<A>>): EventLike<A> {
  return eventDerived((r) => r.occ(s.read()));
}

/** The occurrences of every event in the signal's array, in fire order. */
export function mergeAll<A>(s: Readable<EventLike<A>[]>): EventLike<A> {
  return eventDerived((r) => {
    const es = s.read();
    let out: Occ<A>[] = NONE;
    let lists = 0;
    for (let i = 0; i < es.length; i++) {
      const os = r.occ(es[i]);
      if (os.length === 0) continue;
      out = lists === 0 ? os : out.concat(os);
      lists++;
    }
    return lists > 1 ? out.slice().sort((x, y) => x.s - y.s) : out;
  });
}

/** The occurrences of `e` in rounds that end with `cond` true. */
export function gate<A>(cond: Readable<boolean>, e: EventLike<A>): EventLike<A> {
  return eventDerived((r) => {
    const open = cond.read();
    const os = r.occ(e);
    return open ? os : NONE;
  });
}

/**
 * Call `cb` once per occurrence, in order, until `s` is disposed. The effect
 * behind it runs at most once per round.
 */
export function subscribeEvent<A>(s: Scope, e: EventLike<A>, cb: (a: A) => void): EffectNode {
  let seen = -1;
  return effectIn(s, () => {
    touch(e);
    const v = e.version;
    if (seen < 0 || v === seen) {
      seen = v;
      return;
    }
    seen = v;
    const os = e.value;
    untracked(() => {
      for (let i = 0; i < os.length; i++) {
        try {
          cb(os[i].v);
        } catch (err) {
          reportError(s, err);
        }
      }
    });
  });
}

/** Keep `e` observed for the lifetime of the current scope, and return it. */
export function holdEvent<A>(e: EventLike<A>): EventLike<A> {
  effect(() => { touch(e); });
  return e;
}

// ---------------------------------------------------------------------------
// PureScript entry points of `Screamer.Reactive.Core`

/** A copy of the introspection counters, as an `Effect`. */
export const readStats = () => ({ ...stats });
