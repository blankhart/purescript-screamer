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
/** Development checks: the write guard, cycle detection and counters. */
export const DEV = typeof __DEV__ === 'undefined' ? true : !!__DEV__;
/** Introspection counters, maintained only when `DEV` is on. */
export const stats = { liveEffects: 0, liveScopes: 0, links: 0, effectRuns: 0, steps: 0 };
export const LOOP_LIMIT = 100;
// ---------------------------------------------------------------------------
// Global state
/** Bumped on every write. An unobserved derived node read twice in one epoch returns its cache. */
let epoch = 0;
/** The computation whose dependencies are being captured, if any. */
let current = null;
/** The scope that owns newly created effects, if any. */
let owner = null;
let batchDepth = 0;
/** Greater than zero while a pure derivation (derived or stateful step) runs. */
let inDerived = 0;
let queue = [];
let nextEffectId = 0;
/** Mark counter used to diff dependency arrays without allocating sets. */
let nextMark = 0;
/** Errors from effects with no error handler, rethrown when the flush completes. */
let pendingErrors = [];
/**
 * Nodes that lost their last target during a batch. They unlink when the
 * batch ends unless something observes them again first, so a node that
 * changes observers within one batch neither pauses nor resynchronizes.
 */
let pendingUnobserved = [];
/** Global fire counter: every occurrence gets the next stamp. */
let stamp = 0;
/** The stamp of the current round's start, given to occurrences of `changes`. */
let roundStamp = 0;
/** Greater than zero while the flush loop runs. */
let flushing = 0;
/** Event sources fired since the last round started. */
let fired = [];
/**
 * Stateful nodes over events that were notified and may not have stepped
 * yet. They step at the end of the round, before the next one replaces
 * their inputs' occurrences.
 */
let unsettled = [];
function track(n) {
    const c = current;
    if (c === null)
        return;
    if (n._track === c.runMark)
        return;
    if (c.nested && c.newDeps.indexOf(n) >= 0)
        return;
    n._track = c.runMark;
    c.newDeps.push(n);
    c.newVersions.push(n.version);
}
function startCapture(c) {
    const prev = current;
    if (prev !== null)
        prev.nested = true;
    c.newDeps = [];
    c.newVersions = [];
    c.runMark = ++nextMark;
    c.nested = false;
    current = c;
    return prev;
}
export function linkTo(target, dep) {
    const before = dep.targets.size;
    dep.targets.add(target);
    if (dep.targets.size === before)
        return;
    if (DEV)
        stats.links++;
    if (before === 0 && dep.onFirstTarget)
        dep.onFirstTarget();
}
export function unlinkFrom(target, dep) {
    if (!dep.targets.delete(target))
        return;
    if (DEV)
        stats.links--;
    if (dep.targets.size === 0 && dep.onLastTarget) {
        if (batchDepth > 0)
            pendingUnobserved.push(dep);
        else
            dep.onLastTarget();
    }
}
function releaseUnobserved() {
    while (pendingUnobserved.length > 0) {
        const ps = pendingUnobserved;
        pendingUnobserved = [];
        for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            if (p.targets.size === 0)
                p.onLastTarget();
        }
    }
}
/**
 * Replace the linked dependencies `oldDeps` of `target` with `newDeps`.
 * The difference is computed before any link changes, because linking can
 * run other nodes' hooks. New links are made before old ones are released,
 * so a dependency reached through both does not pause and resume.
 */
function relink(target, oldDeps, newDeps) {
    const n = oldDeps.length;
    if (n === newDeps.length) {
        let same = true;
        for (let i = 0; i < n; i++) {
            if (oldDeps[i] !== newDeps[i]) {
                same = false;
                break;
            }
        }
        if (same)
            return;
    }
    const keep = ++nextMark;
    for (let i = 0; i < n; i++)
        oldDeps[i]._diff = keep;
    const added = [];
    for (let i = 0; i < newDeps.length; i++) {
        if (newDeps[i]._diff !== keep)
            added.push(newDeps[i]);
    }
    const fresh = ++nextMark;
    for (let i = 0; i < newDeps.length; i++)
        newDeps[i]._diff = fresh;
    const removed = [];
    for (let i = 0; i < n; i++) {
        if (oldDeps[i]._diff !== fresh)
            removed.push(oldDeps[i]);
    }
    for (let i = 0; i < added.length; i++)
        linkTo(target, added[i]);
    for (let i = 0; i < removed.length; i++)
        unlinkFrom(target, removed[i]);
}
/** True when any dependency's version differs from the recorded one. Refreshes dependencies in order. */
function depsChanged(deps, versions) {
    for (let i = 0; i < deps.length; i++) {
        const d = deps[i];
        d.refresh();
        if (d.version !== versions[i])
            return true;
    }
    return false;
}
// ---------------------------------------------------------------------------
// Cells
export class Cell {
    constructor(value, eq = Object.is) {
        this.value = value;
        this.eq = eq;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
    }
    refresh() { }
    read() {
        track(this);
        return this.value;
    }
    write(x) {
        if (DEV && inDerived > 0)
            throw new Error('write inside a derivation');
        if (this.eq(x, this.value))
            return;
        this.value = x;
        this.version++;
        epoch++;
        if (this.targets.size === 0)
            return;
        batchDepth++;
        try {
            for (const t of this.targets)
                t.notify();
        }
        finally {
            if (--batchDepth === 0)
                flush();
        }
    }
}
export function cell(value, eq) {
    return new Cell(value, eq);
}
/** A node that never changes. Reading it records no dependency worth tracking, so it is not tracked. */
export class Constant {
    constructor(value) {
        this.value = value;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
    }
    refresh() { }
    read() {
        return this.value;
    }
}
export function constant(value) {
    return new Constant(value);
}
// ---------------------------------------------------------------------------
// Derived nodes
const UNSET = {};
export class Derived {
    constructor(fn, eq = Object.is) {
        this.fn = fn;
        this.eq = eq;
        this.value = UNSET;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
        this.deps = [];
        this.versions = [];
        this.newDeps = [];
        this.newVersions = [];
        this.runMark = 0;
        this.nested = false;
        /** Dependencies are linked (the node is observed). */
        this.linked = false;
        /** Meaningful only while linked: some dependency may have changed. */
        this.dirty = true;
        /** The last refresh threw. The node stays dirty and passes on every notification. */
        this.failed = false;
        /** Epoch of the last successful refresh. */
        this.seen = -1;
        this.init = false;
        this.computing = false;
    }
    notify() {
        if (this.dirty && !this.failed)
            return;
        this.dirty = true;
        for (const t of this.targets)
            t.notify();
    }
    onFirstTarget() {
        if (this.linked)
            return; // still linked: its release was deferred
        let ok = false;
        try {
            this.refresh();
            ok = true;
        }
        catch {
            // Rethrown to whoever reads the node.
        }
        for (let i = 0; i < this.deps.length; i++)
            linkTo(this, this.deps[i]);
        this.linked = true;
        this.dirty = !ok;
    }
    onLastTarget() {
        if (!this.linked)
            return;
        this.linked = false;
        for (let i = 0; i < this.deps.length; i++)
            unlinkFrom(this, this.deps[i]);
        this.dirty = true;
    }
    refresh() {
        if (this.linked) {
            if (!this.dirty)
                return;
        }
        else if (this.init && !this.failed && this.seen === epoch) {
            return;
        }
        if (DEV && this.computing)
            throw new Error('cycle detected among derived signals');
        try {
            if (this.init && !this.failed && !depsChanged(this.deps, this.versions)) {
                this.dirty = false;
                this.seen = epoch;
                return;
            }
            this.recompute();
            this.failed = false;
        }
        catch (e) {
            this.failed = true;
            this.dirty = true;
            throw e;
        }
    }
    recompute() {
        const prevOwner = owner;
        const prev = startCapture(this);
        this.computing = true;
        owner = null;
        inDerived++;
        let v = UNSET;
        let error = null;
        let ok = false;
        try {
            v = this.fn();
            ok = true;
        }
        catch (e) {
            error = e;
        }
        finally {
            current = prev;
            owner = prevOwner;
            inDerived--;
            this.computing = false;
        }
        // Keep what was read, even on failure, so the node hears about changes.
        if (this.linked)
            relink(this, this.deps, this.newDeps);
        this.deps = this.newDeps;
        this.versions = this.newVersions;
        this.newDeps = [];
        this.newVersions = [];
        if (!ok)
            throw error;
        if (!this.init || !this.eq(v, this.value)) {
            this.value = v;
            this.version++;
        }
        this.init = true;
        this.dirty = false;
        this.seen = epoch;
    }
    read() {
        try {
            this.refresh();
        }
        finally {
            track(this);
        }
        return this.value;
    }
}
export function derived(fn, eq) {
    return new Derived(fn, eq);
}
export class Stateful {
    constructor(inputs, initial, step, eq = Object.is, 
    /** The operator that made the node, for development warnings. */
    label = '') {
        this.inputs = inputs;
        this.initial = initial;
        this.step = step;
        this.eq = eq;
        this.label = label;
        this.value = UNSET;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
        this.started = false;
        this.linked = false;
        this.dirty = true;
        this.failed = false;
        this.last = inputs.map(() => -1);
        this.settles = inputs.some(isEvent);
    }
    notify() {
        if (this.dirty && !this.failed)
            return;
        this.dirty = true;
        if (this.settles)
            unsettled.push(this);
        for (const t of this.targets)
            t.notify();
    }
    start() {
        this.value = pure(this.initial);
        this.started = true;
        this.version++;
    }
    onFirstTarget() {
        if (this.linked)
            return; // still linked: its release was deferred
        let ok = false;
        try {
            if (!this.started)
                this.start();
            // Resynchronize: record input versions without stepping.
            for (let i = 0; i < this.inputs.length; i++) {
                const d = this.inputs[i];
                d.refresh();
                this.last[i] = d.version;
            }
            ok = true;
        }
        catch {
            // Rethrown to whoever reads the node.
        }
        for (let i = 0; i < this.inputs.length; i++)
            linkTo(this, this.inputs[i]);
        this.linked = true;
        this.dirty = !ok;
        this.failed = !ok;
    }
    onLastTarget() {
        if (!this.linked)
            return;
        this.linked = false;
        for (let i = 0; i < this.inputs.length; i++)
            unlinkFrom(this, this.inputs[i]);
        this.dirty = true;
    }
    refresh() {
        if (!this.linked) {
            // Paused: keep the state.
            if (!this.started)
                this.start();
            return;
        }
        if (!this.dirty)
            return;
        try {
            if (!this.started)
                this.start();
            const n = this.inputs.length;
            const changed = new Array(n);
            const versions = new Array(n);
            let any = false;
            for (let i = 0; i < n; i++) {
                const d = this.inputs[i];
                d.refresh();
                versions[i] = d.version;
                changed[i] = d.version !== this.last[i];
                if (changed[i])
                    any = true;
            }
            if (any) {
                if (DEV)
                    stats.steps++;
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
        }
        catch (e) {
            this.dirty = true;
            this.failed = true;
            throw e;
        }
    }
    read() {
        // An untracked read of a node that was observed and is not now gets the
        // state it kept when it paused. A tracked read is about to observe it.
        if (DEV && current === null && this.started && !this.linked)
            warnPausedRead(this);
        try {
            this.refresh();
        }
        finally {
            track(this);
        }
        return this.value;
    }
}
const warnedPaused = new WeakSet();
/** Warn, once per node, that a paused stateful node was read. */
function warnPausedRead(n) {
    if (warnedPaused.has(n))
        return;
    warnedPaused.add(n);
    console.warn(`screamer: read of a paused stateful signal${n.label === '' ? '' : ` (${n.label})`}. ` +
        'It keeps the state it had when its last observer left and does not step until observed again; ' +
        'keep it observed (Signal.hold) if it must stay current.');
}
/** Run a pure function: untracked, with no owner, and with writes rejected. */
function pure(fn) {
    const prev = current;
    const prevOwner = owner;
    current = null;
    owner = null;
    inDerived++;
    try {
        return fn();
    }
    finally {
        current = prev;
        owner = prevOwner;
        inDerived--;
    }
}
export function stateful(inputs, initial, step, eq, label) {
    return new Stateful(inputs, initial, step, eq, label);
}
/** Read without recording a dependency. */
export function sample(s) {
    const prev = current;
    current = null;
    try {
        return s.read();
    }
    finally {
        current = prev;
    }
}
/** Run `fn` without recording dependencies. */
export function untracked(fn) {
    const prev = current;
    current = null;
    try {
        return fn();
    }
    finally {
        current = prev;
    }
}
// ---------------------------------------------------------------------------
// Combinators over readables
export function map(f, s) {
    if (s instanceof Constant)
        return constant(f(s.value));
    return derived(() => f(s.read()));
}
export function apply(sf, sa) {
    if (sf instanceof Constant && sa instanceof Constant)
        return constant(sf.value(sa.value));
    return derived(() => sf.read()(sa.read()));
}
/**
 * Monadic bind with dynamic dependencies. The inner signal is rebuilt only
 * when the outer signal's version changes, so stateful inner signals keep
 * their state while the outer value stays put.
 */
export function bind(s, f) {
    let outerVersion = -1;
    let inner = null;
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
export function dropRepeatsBy(eq, s) {
    return derived(() => s.read(), eq);
}
export class Scope {
    constructor(parent) {
        this.parent = parent;
        this.cleanups = [];
        this.children = new Set();
        this.disposed = false;
        this.onError = null;
        /**
         * Context values provided at this scope, or null when it provides none.
         * A scope that provides creates its object with its parent's nearest
         * context as prototype, so a lookup needs only the nearest non-null one.
         */
        this.ctx = null;
        if (parent !== null) {
            if (parent.disposed)
                throw new Error('scope created under a disposed scope');
            parent.children.add(this);
        }
        if (DEV)
            stats.liveScopes++;
    }
    /** Dispose children (newest first), then run own cleanups in reverse order. Idempotent. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        if (DEV)
            stats.liveScopes--;
        if (this.parent !== null)
            this.parent.children.delete(this);
        let error = null;
        let failed = false;
        if (this.children.size > 0) {
            const children = Array.from(this.children);
            this.children.clear();
            for (let i = children.length - 1; i >= 0; i--) {
                try {
                    children[i].dispose();
                }
                catch (e) {
                    if (!failed) {
                        error = e;
                        failed = true;
                    }
                }
            }
        }
        const cleanups = this.cleanups;
        this.cleanups = [];
        for (let i = cleanups.length - 1; i >= 0; i--) {
            try {
                const c = cleanups[i];
                if (typeof c === 'function')
                    c();
                else
                    c.dispose();
            }
            catch (e) {
                if (!failed) {
                    error = e;
                    failed = true;
                }
            }
        }
        if (failed)
            throw error;
    }
}
/** The context of the nearest scope at or above `s` that has one, or null. */
export function contextOf(s) {
    for (let x = s; x !== null; x = x.parent)
        if (x.ctx !== null)
            return x.ctx;
    return null;
}
/** The value provided for `key` at or above `s`, or `dflt` when none is. */
export function lookupContext(s, key, dflt) {
    const ctx = contextOf(s);
    return ctx !== null && key in ctx ? ctx[key] : dflt;
}
export function createScope(parent = owner) {
    return new Scope(parent);
}
/** Run `fn` with `s` as the owner of new effects. Dependencies are not captured. */
export function runInScope(s, fn) {
    if (s.disposed)
        throw new Error('running in a disposed scope');
    const prevOwner = owner;
    const prev = current;
    owner = s;
    current = null;
    try {
        return fn();
    }
    finally {
        owner = prevOwner;
        current = prev;
    }
}
/** Create a child scope of the current owner (or a root), run `fn` in it, and return its disposer. */
export function scope(fn, parent = owner) {
    const s = new Scope(parent);
    batch(() => runInScope(s, () => fn(s)));
    return disposerOf(s);
}
// A separate function, so the disposer's closure does not share a context
// with (and retain) the setup function.
function disposerOf(s) {
    return () => s.dispose();
}
export function getOwner() {
    return owner;
}
export function onCleanup(f) {
    if (owner === null)
        throw new Error('onCleanup outside a scope');
    owner.cleanups.push(f);
}
/** Report an error to the nearest error handler, or rethrow it when the flush completes. */
export function reportError(s, error) {
    for (let x = s; x !== null; x = x.parent) {
        if (x.onError !== null) {
            try {
                x.onError(error);
                return;
            }
            catch (e) {
                error = e;
            }
        }
    }
    pendingErrors.push(error);
}
// ---------------------------------------------------------------------------
// Effects
export class EffectNode {
    constructor(fn, scope) {
        this.fn = fn;
        this.scope = scope;
        this.id = nextEffectId++;
        this.deps = [];
        this.versions = [];
        this.newDeps = [];
        this.newVersions = [];
        this.runMark = 0;
        this.nested = false;
        this.queued = false;
        this.disposed = false;
    }
    notify() {
        if (this.queued || this.disposed)
            return;
        this.queued = true;
        queue.push(this);
    }
    stale() {
        try {
            return depsChanged(this.deps, this.versions);
        }
        catch {
            // A dependency threw; run so the error is reported through this effect.
            return true;
        }
    }
    run() {
        if (this.disposed)
            return;
        if (DEV)
            stats.effectRuns++;
        const prevOwner = owner;
        const prev = startCapture(this);
        owner = null;
        try {
            this.fn();
        }
        catch (e) {
            reportError(this.scope, e);
        }
        finally {
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
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        if (DEV)
            stats.liveEffects--;
        const deps = this.deps;
        this.deps = [];
        this.versions = [];
        for (let i = 0; i < deps.length; i++)
            unlinkFrom(this, deps[i]);
    }
}
/**
 * Create an effect owned by the current scope and run it once. Writes made
 * while it runs are queued into the next flush round.
 */
export function effect(fn) {
    const s = owner;
    if (s === null)
        throw new Error('effect outside a scope');
    return effectIn(s, fn);
}
/** Create an effect owned by `s` and run it once. */
export function effectIn(s, fn) {
    if (s.disposed)
        throw new Error('effect created in a disposed scope');
    const e = new EffectNode(fn, s);
    if (DEV)
        stats.liveEffects++;
    s.cleanups.push(e);
    batchDepth++;
    try {
        e.run();
    }
    finally {
        if (--batchDepth === 0)
            flush();
    }
    return e;
}
/** Keep `s` observed for the lifetime of the current scope, and return it. */
export function hold(s) {
    effect(() => { s.read(); });
    return s;
}
// ---------------------------------------------------------------------------
// Batching
/** Run `f`; effects triggered by its writes run once when the outermost batch returns. */
export function batch(f) {
    batchDepth++;
    try {
        return f();
    }
    finally {
        if (--batchDepth === 0)
            flush();
    }
}
export function isBatching() {
    return batchDepth > 0;
}
function flush() {
    let rounds = 0;
    let loopError = null;
    batchDepth++;
    flushing++;
    try {
        while (queue.length > 0 || fired.length > 0) {
            if (++rounds > LOOP_LIMIT) {
                for (const e of queue)
                    e.queued = false;
                queue = [];
                for (const src of fired)
                    src.pending = [];
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
                if (!e.disposed && e.stale())
                    e.run();
            }
            settle();
        }
    }
    finally {
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
        for (let i = 1; i < errors.length; i++)
            console.error(errors[i]);
        throw errors[0];
    }
}
const NONE = [];
function isEvent(n) {
    return n.isEvent === true;
}
/** Refresh `n` and record it as a dependency of the current computation. */
export function touch(n) {
    try {
        n.refresh();
    }
    finally {
        track(n);
    }
}
/** Step every stateful node over events that is still waiting to. */
function settle() {
    while (unsettled.length > 0) {
        const ns = unsettled;
        unsettled = [];
        for (let i = 0; i < ns.length; i++) {
            const n = ns[i];
            if (n.linked && n.dirty) {
                try {
                    n.refresh();
                }
                catch {
                    // Rethrown to whoever reads the node.
                }
            }
        }
    }
}
/** Start a round: deliver the occurrences fired since the last one. */
function startRound() {
    roundStamp = ++stamp;
    if (fired.length === 0)
        return;
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
        for (const t of fs[i].targets)
            t.notify();
    }
}
export class EventSourceNode {
    constructor() {
        this.isEvent = true;
        this.value = NONE;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
        /** Occurrences fired since the last round started. */
        this.pending = [];
    }
    refresh() { }
    /** Add an occurrence. It is delivered when the next round starts. */
    fire(x) {
        if (DEV && inDerived > 0)
            throw new Error('fire inside a derivation');
        // Nothing observes the event, so the occurrence goes nowhere.
        if (this.targets.size === 0)
            return;
        if (this.pending.length === 0)
            fired.push(this);
        this.pending.push({ s: ++stamp, v: x });
        if (batchDepth === 0)
            flush();
    }
}
export function eventSource() {
    return new EventSourceNode();
}
/** The event that never fires. */
export const neverEvent = new EventSourceNode();
/**
 * A stateless event node with dynamic dependencies. Its function reads
 * events through `occ`, and signals through `read` as usual, and returns
 * this round's occurrences.
 */
export class EventDerived {
    constructor(fn) {
        this.fn = fn;
        this.isEvent = true;
        this.value = NONE;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
        this.deps = [];
        this.versions = [];
        this.newDeps = [];
        this.newVersions = [];
        this.runMark = 0;
        this.nested = false;
        this.linked = false;
        this.dirty = true;
        this.failed = false;
        this.init = false;
        this.computing = false;
        /** Resynchronizing: record the inputs' versions and produce nothing. */
        this.quiet = false;
    }
    notify() {
        if (this.dirty && !this.failed)
            return;
        this.dirty = true;
        for (const t of this.targets)
            t.notify();
    }
    onFirstTarget() {
        if (this.linked)
            return; // still linked: its release was deferred
        let ok = false;
        try {
            this.recompute(true);
            ok = true;
        }
        catch {
            // Rethrown to whoever reads the node.
        }
        for (let i = 0; i < this.deps.length; i++)
            linkTo(this, this.deps[i]);
        this.linked = true;
        this.dirty = !ok;
        this.failed = !ok;
    }
    onLastTarget() {
        if (!this.linked)
            return;
        this.linked = false;
        for (let i = 0; i < this.deps.length; i++)
            unlinkFrom(this, this.deps[i]);
        this.dirty = true;
    }
    refresh() {
        if (this.linked && !this.dirty)
            return;
        if (DEV && this.computing)
            throw new Error('cycle detected among derived events');
        try {
            if (this.init && !this.failed && !depsChanged(this.deps, this.versions)) {
                this.dirty = false;
                return;
            }
            this.recompute(false);
            this.failed = false;
        }
        catch (e) {
            this.failed = true;
            this.dirty = true;
            throw e;
        }
    }
    /** The version this computation recorded for `n` last time, or -1. */
    seen(n) {
        const i = this.deps.indexOf(n);
        return i < 0 ? -1 : this.versions[i];
    }
    occ(e) {
        touch(e);
        if (this.quiet)
            return NONE;
        const v = this.seen(e);
        return v < 0 || v === e.version ? NONE : e.value;
    }
    changed(s) {
        touch(s);
        if (this.quiet)
            return false;
        const v = this.seen(s);
        return v >= 0 && v !== s.version;
    }
    recompute(quiet) {
        const prevOwner = owner;
        const prev = startCapture(this);
        this.computing = true;
        this.quiet = quiet;
        owner = null;
        inDerived++;
        let v = NONE;
        let error = null;
        let ok = false;
        try {
            v = this.fn(this);
            ok = true;
        }
        catch (e) {
            error = e;
        }
        finally {
            current = prev;
            owner = prevOwner;
            inDerived--;
            this.computing = false;
            this.quiet = false;
        }
        if (this.linked)
            relink(this, this.deps, this.newDeps);
        this.deps = this.newDeps;
        this.versions = this.newVersions;
        this.newDeps = [];
        this.newVersions = [];
        if (!ok)
            throw error;
        this.init = true;
        this.dirty = false;
        if (quiet || v.length === 0) {
            this.value = NONE;
        }
        else {
            this.value = v;
            this.version++;
        }
    }
}
export function eventDerived(fn) {
    return new EventDerived(fn);
}
/**
 * A stateful event node: like `Stateful`, but each step produces
 * occurrences. It starts from `initial` when first observed, steps once per
 * round in which an input changed, keeps its state while paused and
 * resynchronizes without stepping when observed again.
 */
export class EventStateful {
    constructor(inputs, initial, step, 
    /** The state to keep while paused; by default all of it. */
    pause) {
        this.inputs = inputs;
        this.initial = initial;
        this.step = step;
        this.pause = pause;
        this.isEvent = true;
        this.value = NONE;
        this.version = 0;
        this.targets = new Set();
        this._track = 0;
        this._diff = 0;
        this.state = UNSET;
        this.started = false;
        this.linked = false;
        this.dirty = true;
        this.failed = false;
        this.last = inputs.map(() => -1);
    }
    notify() {
        if (this.dirty && !this.failed)
            return;
        this.dirty = true;
        unsettled.push(this);
        for (const t of this.targets)
            t.notify();
    }
    onFirstTarget() {
        if (this.linked)
            return; // still linked: its release was deferred
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
        }
        catch {
            // Rethrown to whoever reads the node.
        }
        this.value = NONE;
        for (let i = 0; i < this.inputs.length; i++)
            linkTo(this, this.inputs[i]);
        this.linked = true;
        this.dirty = !ok;
        this.failed = !ok;
    }
    onLastTarget() {
        if (!this.linked)
            return;
        this.linked = false;
        for (let i = 0; i < this.inputs.length; i++)
            unlinkFrom(this, this.inputs[i]);
        this.dirty = true;
        if (this.pause && this.started)
            this.state = this.pause(this.state);
    }
    refresh() {
        // Paused: produce nothing and keep the state.
        if (!this.linked || !this.dirty)
            return;
        try {
            if (!this.started) {
                this.state = pure(this.initial);
                this.started = true;
            }
            const n = this.inputs.length;
            const changed = new Array(n);
            const versions = new Array(n);
            let any = false;
            for (let i = 0; i < n; i++) {
                const d = this.inputs[i];
                d.refresh();
                versions[i] = d.version;
                changed[i] = d.version !== this.last[i];
                if (changed[i])
                    any = true;
            }
            if (any) {
                if (DEV)
                    stats.steps++;
                const values = this.inputs.map((d) => d.value);
                const state = this.state;
                const r = pure(() => this.step(changed, values, state));
                this.state = r.state;
                if (r.out.length > 0) {
                    this.value = r.out;
                    this.version++;
                }
                else {
                    this.value = NONE;
                }
            }
            this.last = versions;
            this.dirty = false;
            this.failed = false;
        }
        catch (e) {
            this.dirty = true;
            this.failed = true;
            throw e;
        }
    }
}
export function eventStateful(inputs, initial, step, pause) {
    return new EventStateful(inputs, initial, step, pause);
}
/**
 * A per-occurrence state machine over one event: `f` sees each occurrence
 * in order with the current state, and may emit one occurrence for it, with
 * its stamp. Stateful: starts from `seed()` when first observed and steps
 * only while observed.
 */
export function accumEvent(f, seed, e) {
    return eventStateful([e], seed, (_, values, state) => {
        const os = values[0];
        const out = [];
        for (let i = 0; i < os.length; i++) {
            const r = f(os[i].v, state);
            state = r.state;
            if (r.emit)
                out.push({ s: os[i].s, v: r.value });
        }
        return { state, out };
    });
}
/** Occurrences of both lists in stamp order; the left goes first on equal stamps. */
export function interleave(a, b) {
    if (a.length === 0)
        return b;
    if (b.length === 0)
        return a;
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (b[j].s < a[i].s)
            out.push(b[j++]);
        else
            out.push(a[i++]);
    }
    while (i < a.length)
        out.push(a[i++]);
    while (j < b.length)
        out.push(b[j++]);
    return out;
}
export function mapEvent(f, e) {
    if (e === neverEvent)
        return neverEvent;
    return eventDerived((r) => {
        const os = r.occ(e);
        if (os.length === 0)
            return NONE;
        const out = new Array(os.length);
        for (let i = 0; i < os.length; i++)
            out[i] = { s: os[i].s, v: f(os[i].v) };
        return out;
    });
}
export function filterMapEvent(f, e) {
    return eventDerived((r) => {
        const os = r.occ(e);
        const out = [];
        for (let i = 0; i < os.length; i++) {
            const x = f(os[i].v);
            if (x.ok)
                out.push({ s: os[i].s, v: x.v });
        }
        return out;
    });
}
export function filterEvent(p, e) {
    return eventDerived((r) => {
        const os = r.occ(e);
        const out = [];
        for (let i = 0; i < os.length; i++)
            if (p(os[i].v))
                out.push(os[i]);
        return out.length === os.length ? os : out;
    });
}
/** Both events' occurrences in fire order; neither is dropped. */
export function alt(a, b) {
    if (a === neverEvent)
        return b;
    if (b === neverEvent)
        return a;
    return eventDerived((r) => interleave(r.occ(a), r.occ(b)));
}
/**
 * The stamp for an occurrence caused by a signal's change: the current
 * round's start, after every fire of the round, or a fresh stamp outside a
 * flush.
 */
export function signalStamp() {
    return flushing > 0 ? roundStamp : ++stamp;
}
/** An occurrence with the signal's new value in each round in which it changed. */
export function changes(s) {
    return eventDerived((r) => (r.changed(s) ? [{ s: signalStamp(), v: s.value }] : NONE));
}
/** The latest occurrence, starting at `seed`. Stateful: steps only while observed. */
export function stepper(seed, e) {
    return stateful([e], () => seed, (_, values) => {
        const os = values[0];
        return os[os.length - 1].v;
    }, undefined, 'Event.stepper');
}
/** Accumulate from `seed`, one step per occurrence. */
export function foldEvent(f, seed, e) {
    return stateful([e], () => seed, (_, values, b) => {
        const os = values[0];
        for (let i = 0; i < os.length; i++)
            b = f(os[i].v, b);
        return b;
    }, undefined, 'Event.fold');
}
/** Each occurrence combined with the signal's value at the end of the round. */
export function attachWith(f, s, e) {
    return eventDerived((r) => {
        const b = s.read();
        const os = r.occ(e);
        if (os.length === 0)
            return NONE;
        const out = new Array(os.length);
        for (let i = 0; i < os.length; i++)
            out[i] = { s: os[i].s, v: f(b, os[i].v) };
        return out;
    });
}
// ---------------------------------------------------------------------------
// Flattening (#21)
/**
 * The occurrences of whichever event the signal holds. When the signal
 * changes, the new event is followed from then on: it delivers nothing
 * fired before it was switched to.
 */
export function switchEvent(s) {
    return eventDerived((r) => r.occ(s.read()));
}
/**
 * Call `cb` once per occurrence, in order, until `s` is disposed. The effect
 * behind it runs at most once per round.
 */
export function subscribeEvent(s, e, cb) {
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
                }
                catch (err) {
                    reportError(s, err);
                }
            }
        });
    });
}
/** Keep `e` observed for the lifetime of the current scope, and return it. */
export function holdEvent(e) {
    effect(() => { touch(e); });
    return e;
}
// ---------------------------------------------------------------------------
// PureScript entry points of `Screamer.Runtime`
/** A copy of the introspection counters, as an `Effect`. */
export const readStats = () => ({ ...stats });
