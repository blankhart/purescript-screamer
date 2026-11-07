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
//   instead of a current value.
//
// Writes mark observed dependents dirty and queue effects (push). Reads
// recompute only nodes whose recorded dependency versions changed (pull).
// An effect runs at most once per flush round and always sees a consistent
// graph.
//
// A node's version counts its updates, and the moments of update are part
// of a signal's meaning (#68). A cell updates when it is written a value
// that differs from its current one under its equality: values are compared
// only there, at the source. A derived node updates every time it
// recomputes, which is whenever a dependency updated, whatever value it
// computes, so a function cannot hide an update. A stateful node updates
// when it steps, unless its step returns `noUpdate`; `dropRepeatsBy` is
// the stateful node that does so for repeated values, and the only cutoff.
//
// Names that write say which round they act on: T0 is the current round, T1
// the next. `putT1`, `modifyT1` and `fireT1` take effect when the next round
// starts. A write made by an effect, during a flush or inside a batch is
// deferred to then, as a fire is, so every effect in a round sees the same
// value of every cell, whatever order the effects were created in, and a
// read right after such a write still returns the round's value. `readT1`
// gives the value the next round will start with. A write outside all of
// these starts the next round at once.
/** Development checks: the write guard, cycle detection and counters. */
export const DEV = typeof __DEV__ === 'undefined' ? true : !!__DEV__;
/** Introspection counters, maintained only when `DEV` is on. */
export const stats = { liveEffects: 0, liveScopes: 0, links: 0, effectRuns: 0, steps: 0 };
export const LOOP_LIMIT = 100;
let devHook = null;
let strict = false;
/** Install the one development listener, or remove it with null. */
export function setDevHook(h) {
    if (DEV)
        devHook = h;
}
/** Make development warnings throw, with the same message, instead of warning. */
export function setStrict(b) {
    if (DEV)
        strict = b;
}
export function isStrict() {
    return strict;
}
/** An error the runtime throws in development, with its diagnostic code. */
function devError(code, message) {
    return new Error(`screamer ${code}: ${message}`);
}
/**
 * Report a development warning: to the hook, then as a thrown error under
 * strict mode or else to the console.
 */
function warn(code, message, scope = writerScope()) {
    const text = `screamer ${code}: ${message}`;
    if (devHook !== null)
        devHook({ type: 'warning', code, message: text, scope });
    if (strict)
        throw new Error(text);
    console.warn(text);
}
let nextScopeId = 0;
const scopeInfos = new WeakMap();
/** Root scopes not yet disposed, in creation order (`DEV` only). */
const liveRoots = new Set();
/** What development tools know about `s`. Empty outside development. */
export function scopeInfo(s) {
    return scopeInfos.get(s) ?? { id: -1, kind: '', name: '', key: undefined, nodes: [] };
}
/** Record what made `s`, for development tools. A no-op outside development. */
export function tagScope(s, kind, name = '', key) {
    if (!DEV)
        return;
    const info = scopeInfos.get(s);
    if (info === undefined)
        return;
    info.kind = kind;
    info.name = name;
    info.key = key;
}
/** The innermost scope that recorded each node as one of its top-level nodes. */
const nodeOwners = new WeakMap();
/**
 * Record the top-level nodes an element built in `s`. A node keeps the
 * first live scope that records it, which is the innermost, since an
 * element finishes building before the elements around it.
 */
export function setScopeNodes(s, nodes) {
    if (!DEV)
        return;
    const info = scopeInfos.get(s);
    if (info === undefined)
        return;
    info.nodes = nodes;
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const o = nodeOwners.get(n);
        if (o === undefined || o.disposed)
            nodeOwners.set(n, s);
    }
}
/** The live scope that recorded `node` as a top-level node, or null. */
export function ownerOfNode(node) {
    const o = nodeOwners.get(node);
    return o === undefined || o.disposed ? null : o;
}
// Creation sites
let trackOrigins = false;
const origins = new WeakMap();
/** Record a stack trace where each scope, source, stateful node and effect is created. Costly. */
export function setTrackOrigins(b) {
    if (DEV)
        trackOrigins = b;
}
function recordOrigin(x) {
    // Deep enough to get past Screamer's own frames to the program's.
    const E = Error;
    const limit = E.stackTraceLimit;
    E.stackTraceLimit = 40;
    const stack = new Error().stack;
    E.stackTraceLimit = limit;
    if (stack !== undefined)
        origins.set(x, stack);
}
/** The stack trace recorded when `x` was created, or null. */
export function originOf(x) {
    return origins.get(x) ?? null;
}
// Consistency checks
let checking = false;
const checks = new Map();
/**
 * Check, after each timestep, the bindings registered with `registerCheck`
 * while this is on: each returns null when the DOM shows its signal's
 * current value, and otherwise a message, reported as `SCR003`.
 */
export function setConsistencyCheck(b) {
    if (DEV)
        checking = b;
}
export function consistencyChecking() {
    return checking;
}
/** Register a check for the lifetime of `s`, if checking is on. */
export function registerCheck(s, check) {
    if (!DEV || !checking)
        return;
    checks.set(check, s);
    s.cleanups.push(() => { checks.delete(check); });
}
function runChecks() {
    for (const [check, s] of Array.from(checks)) {
        const problem = untracked(check);
        if (problem !== null)
            warn('SCR003', problem, s);
    }
}
// Graph introspection
/** What kind of node `n` is, for development tools. */
export function nodeKind(n) {
    if (n instanceof Cell)
        return 'signal source';
    if (n instanceof EventSourceNode)
        return 'event source';
    if (n instanceof Constant)
        return 'constant';
    if (n instanceof Derived)
        return 'derived signal';
    if (n instanceof Stateful)
        return 'stateful signal';
    if (n instanceof EventDerived)
        return 'derived event';
    if (n instanceof EventStateful)
        return 'stateful event';
    if (n instanceof EffectNode)
        return 'effect';
    return 'node';
}
/** The label of a stateful node (the operator that made it), or empty. */
export function nodeLabel(n) {
    return n instanceof Stateful ? n.label : '';
}
/** The nodes `n` read when it last ran, and their versions then (for an effect or derived node). */
export function nodeInputs(n) {
    if (n instanceof EffectNode)
        return { inputs: n.deps, versions: n.versions };
    if (n instanceof Derived || n instanceof EventDerived)
        return { inputs: n.deps, versions: null };
    if (n instanceof Stateful || n instanceof EventStateful)
        return { inputs: n.inputs, versions: null };
    return { inputs: [], versions: null };
}
/** Whether an effect has been disposed. */
export function effectDisposed(e) {
    return e.disposed;
}
/** The root scopes not yet disposed, in creation order. Empty outside development. */
export function rootScopes() {
    return Array.from(liveRoots);
}
/** How many effects `s` owns directly. */
export function effectCount(s) {
    let n = 0;
    for (let i = 0; i < s.cleanups.length; i++)
        if (s.cleanups[i] instanceof EffectNode)
            n++;
    return n;
}
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
/** Greater than zero while an effect's function runs. */
let inEffect = 0;
/** The effect whose function is running, if any; for the conflict warning. */
let runningEffect = null;
/** Cells written by effects or during a flush since the last round started. */
let written = [];
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
        /** The value of a deferred write, meaningful only if `deferred`. */
        this.next = UNSET;
        this.deferred = false;
        /** Where the deferred write came from, for the conflict warning (`DEV` only). */
        this.writer = null;
        /**
         * Writes from several places in one round are expected to commute, so
         * they don't warn: runtime bookkeeping, or a source made with
         * `commutingSignalSource`.
         */
        this.commutes = false;
        if (DEV) {
            if (trackOrigins)
                recordOrigin(this);
            if (devHook !== null)
                devHook({ type: 'sourceCreated', source: this });
        }
    }
    refresh() { }
    read() {
        track(this);
        return this.value;
    }
    /**
     * Set the value from the start of the next round. A write made by an
     * effect, during a flush or inside a batch is deferred to then, like a
     * fire: every effect in a round sees the value the round started with,
     * and `read` returns it until the next round. Of several writes to one
     * cell deferred to one round, the last made is the one applied. A write
     * outside all of these starts the next round at once.
     */
    putT1(x) {
        if (DEV && inDerived > 0)
            throw devError('SCR101', 'write inside a derivation');
        if (DEV && devHook !== null)
            devHook({ type: 'write', source: this, value: x, scope: writerScope() });
        // Effects only run inside a batch or a flush, both of which count here.
        if (batchDepth > 0) {
            if (!this.deferred) {
                this.deferred = true;
                written.push(this);
                if (DEV)
                    this.writer = currentWriter();
            }
            else if (DEV && !this.commutes && !this.eq(x, this.next)) {
                checkWriter(this, 'signal source', this.writer);
            }
            this.next = x;
            return;
        }
        this.putT0(x);
    }
    /**
     * Set the value at once, even inside an effect or a flush. For runtime
     * bookkeeping that the writer reads back synchronously, such as the
     * pending-work counts behind `suspense`; it brings back the order
     * dependence that `putT1` avoids. A cell uses one or the other.
     */
    putT0(x) {
        if (DEV && inDerived > 0)
            throw devError('SCR101', 'write inside a derivation');
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
    /** The value including a deferred write: what the next round will start with. */
    readT1() {
        return this.deferred ? this.next : this.value;
    }
    /** `putT1` of `f` of `readT1()`, so deferred updates compose. */
    modifyT1(f) {
        this.putT1(f(this.readT1()));
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
    constructor(fn) {
        this.fn = fn;
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
            throw devError('SCR103', 'cycle detected among derived signals');
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
        // Recomputed because a dependency updated (or for the first time): an
        // update, whatever the value.
        this.value = v;
        this.version++;
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
export function derived(fn) {
    return new Derived(fn);
}
// ---------------------------------------------------------------------------
// Stateful nodes
//
// Stateful signals advance only while observed.
//
// - Start. State begins at the seed (for `merge`, the left input's current
//   value). Values the input held before observation are not stepped over.
// - Step. One step per propagation in which an input updated. Writes inside
//   one batch coalesce, so two writes in one handler step a node once. A
//   step is an update unless it returns `noUpdate`, which keeps the state.
// - Pause. When the last observer goes, the node unlinks and keeps its state.
//   `read` returns that state. When observed again it resynchronizes with its
//   inputs without stepping, then continues.
// - Simultaneity. When both inputs of `merge` change in one batch, the left
//   wins.
//
// Guarantee: two evaluations of the same stateful expression produce the
// same values whenever they are observed over the same interval. Where a
// program needs one state regardless of who observes it, `hold` observes the
// signal for the lifetime of the current scope and returns the same node.
/** What a step returns to keep the state and not update. */
export const noUpdate = {};
export class Stateful {
    constructor(inputs, initial, step, 
    /** The operator that made the node, for development warnings. */
    label = '') {
        this.inputs = inputs;
        this.initial = initial;
        this.step = step;
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
        this.changed = inputs.map(() => false);
        this.values = inputs.map(() => undefined);
        if (DEV && trackOrigins)
            recordOrigin(this);
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
            const changed = this.changed;
            const values = this.values;
            let any = false;
            for (let i = 0; i < n; i++) {
                const d = this.inputs[i];
                d.refresh();
                changed[i] = d.version !== this.last[i];
                if (changed[i])
                    any = true;
            }
            if (any) {
                if (DEV)
                    stats.steps++;
                for (let i = 0; i < n; i++)
                    values[i] = this.inputs[i].value;
                const v = pure(() => this.step(changed, values, this.value));
                for (let i = 0; i < n; i++)
                    values[i] = undefined;
                if (v !== noUpdate) {
                    this.value = v;
                    this.version++;
                }
            }
            for (let i = 0; i < n; i++)
                this.last[i] = this.inputs[i].version;
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
    if (warnedPaused.has(n) && !strict)
        return;
    warnedPaused.add(n);
    warn('SCR001', `read of a paused stateful signal${n.label === '' ? '' : ` (${n.label})`}. ` +
        'It keeps the state it had when its last observer left and does not step until observed again; ' +
        'keep it observed (Signal.hold) if it must stay current.');
}
/** The scope a write or warning comes from, for the development hook. */
function writerScope() {
    if (owner !== null)
        return owner;
    if (runningEffect !== null)
        return runningEffect.scope;
    return null;
}
function currentWriter() {
    if (owner !== null)
        return { effect: null, scope: owner };
    if (runningEffect !== null)
        return { effect: runningEffect, scope: runningEffect.scope };
    return null;
}
/**
 * Whether two writers' writes to one source in one round have no order the
 * program states. Writes from one effect, or from one scope's setup code and
 * the effects it creates, do have one.
 */
function conflicting(a, b) {
    if (a.effect !== null && b.effect !== null)
        return a.effect !== b.effect;
    return a.scope !== b.scope;
}
const warnedConflict = new WeakSet();
/**
 * Warn, once per source, when a source is written or fired for one round by
 * two writers with no stated order between them (#72). The runtime then
 * applies them in the order the writers ran, which is creation order.
 */
function checkWriter(src, kind, first) {
    const w = currentWriter();
    if (first === null) {
        src.writer = w;
        return;
    }
    if (w === null || !conflicting(first, w) || (warnedConflict.has(src) && !strict))
        return;
    warnedConflict.add(src);
    warn('SCR002', `one ${kind} was ${kind === 'event source' ? 'fired' : 'written'} by two subscribers (or two components' setup) in one timestep. ` +
        'They apply in the order the subscribers were created, which the program does not state, so the result can change when ' +
        'a component moves or mounts in a different order. Combine the causes into one event, write from one subscriber, ' +
        'or make the source with commutingSignalSource or commutingEventSource if the order does not matter.');
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
export function stateful(inputs, initial, step, label) {
    return new Stateful(inputs, initial, step, label);
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
 * when the outer signal updates. The result updates when the outer signal
 * or the current inner one does.
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
/**
 * `s`, updating only when `s` updates to a value not equivalent to the one
 * shown. Stateful: it remembers the value shown, so it must be kept
 * observed (held) from when it is made.
 */
export function dropRepeatsBy(eq, s) {
    return stateful([s], () => s.read(), (_, values, shown) => (eq(values[0], shown) ? noUpdate : values[0]), 'Signal.dropRepeatsBy');
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
        if (DEV) {
            stats.liveScopes++;
            scopeInfos.set(this, { id: nextScopeId++, kind: '', name: '', key: undefined, nodes: [] });
            if (trackOrigins)
                recordOrigin(this);
            if (parent === null)
                liveRoots.add(this);
            if (devHook !== null)
                devHook({ type: 'scopeCreated', scope: this });
        }
    }
    /** Dispose children (newest first), then run own cleanups in reverse order. Idempotent. */
    dispose() {
        if (this.disposed)
            return;
        if (DEV) {
            // Before it leaves its parent, so the hook can still find its path.
            if (devHook !== null)
                devHook({ type: 'scopeDisposed', scope: this });
            liveRoots.delete(this);
            stats.liveScopes--;
        }
        this.disposed = true;
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
    if (DEV && devHook !== null)
        devHook({ type: 'error', error, scope: s });
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
        if (DEV && trackOrigins)
            recordOrigin(this);
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
        if (DEV) {
            stats.effectRuns++;
            if (devHook !== null)
                devHook({ type: 'effectRun', effect: this, scope: this.scope });
        }
        const prevOwner = owner;
        const prevRunning = runningEffect;
        const prev = startCapture(this);
        owner = null;
        runningEffect = this;
        inEffect++;
        try {
            this.fn();
        }
        catch (e) {
            reportError(this.scope, e);
        }
        finally {
            current = prev;
            owner = prevOwner;
            runningEffect = prevRunning;
            inEffect--;
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
 * Create an effect owned by the current scope and run it once. Writes and
 * fires made while it runs take effect when the next flush round starts.
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
/** Whether a timestep is running: an effect, or the flush that runs effects. */
export function inTimestep() {
    return flushing > 0 || inEffect > 0;
}
function flush() {
    let rounds = 0;
    let loopError = null;
    batchDepth++;
    flushing++;
    try {
        while (queue.length > 0 || fired.length > 0 || written.length > 0) {
            if (++rounds > LOOP_LIMIT) {
                for (const e of queue)
                    e.queued = false;
                queue = [];
                for (const src of fired)
                    src.pending = [];
                fired = [];
                for (const c of written) {
                    c.deferred = false;
                    c.next = UNSET;
                    c.writer = null;
                }
                written = [];
                loopError = devError('SCR105', 'effect loop');
                break;
            }
            if (DEV && devHook !== null)
                devHook({ type: 'roundStart' });
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
            if (DEV && devHook !== null)
                devHook({ type: 'roundEnd' });
        }
    }
    finally {
        batchDepth--;
        flushing--;
    }
    releaseUnobserved();
    if (DEV && checking && loopError === null && pendingErrors.length === 0)
        runChecks();
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
/**
 * Start a round: apply the writes deferred since the last one and deliver the
 * occurrences fired since then, then notify their observers.
 */
function startRound() {
    roundStamp = ++stamp;
    if (fired.length === 0 && written.length === 0)
        return;
    const ws = written;
    written = [];
    const fs = fired;
    fired = [];
    epoch++;
    const changed = [];
    for (let i = 0; i < ws.length; i++) {
        const c = ws[i];
        const x = c.next;
        c.deferred = false;
        c.next = UNSET;
        c.writer = null;
        if (c.eq(x, c.value))
            continue;
        c.value = x;
        c.version++;
        changed.push(c);
    }
    for (let i = 0; i < fs.length; i++) {
        const src = fs[i];
        src.value = src.pending;
        src.pending = [];
        src.writer = null;
        src.version++;
    }
    for (let i = 0; i < changed.length; i++) {
        for (const t of changed[i].targets)
            t.notify();
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
        /** Where the pending occurrences came from, for the conflict warning (`DEV` only). */
        this.writer = null;
        /** Fires from several places in one round are expected; see `Cell.commutes`. */
        this.commutes = false;
        if (DEV) {
            if (trackOrigins)
                recordOrigin(this);
            if (devHook !== null)
                devHook({ type: 'sourceCreated', source: this });
        }
    }
    refresh() { }
    /** Add an occurrence. It is delivered when the next round starts. */
    fireT1(x) {
        if (DEV && inDerived > 0)
            throw devError('SCR102', 'fire inside a derivation');
        // Nothing observes the event, so the occurrence goes nowhere.
        if (this.targets.size === 0)
            return;
        if (DEV && devHook !== null)
            devHook({ type: 'fire', source: this, value: x, scope: writerScope() });
        if (this.pending.length === 0) {
            fired.push(this);
            if (DEV && batchDepth > 0)
                this.writer = currentWriter();
        }
        else if (DEV && batchDepth > 0 && !this.commutes) {
            checkWriter(this, 'event source', this.writer);
        }
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
            throw devError('SCR104', 'cycle detected among derived events');
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
/** An occurrence with the signal's new value in each round in which it updated. */
export function changes(s) {
    return eventDerived((r) => (r.changed(s) ? [{ s: signalStamp(), v: s.value }] : NONE));
}
/** The latest occurrence, starting at `seed`. Stateful: steps only while observed. */
export function stepper(seed, e) {
    return stateful([e], () => seed, (_, values) => {
        const os = values[0];
        return os[os.length - 1].v;
    }, 'Event.stepper');
}
/** Accumulate from `seed`, one step per occurrence. */
export function foldEvent(f, seed, e) {
    return stateful([e], () => seed, (_, values, b) => {
        const os = values[0];
        for (let i = 0; i < os.length; i++)
            b = f(os[i].v, b);
        return b;
    }, 'Event.fold');
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
