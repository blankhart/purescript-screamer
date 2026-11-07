// @ts-ignore: purs copies this file to output/Screamer.Element/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
// @ts-ignore: likewise output/Screamer.Renderer/foreign.js.
import * as renderer from '../Screamer.Renderer/foreign.js';
const R = runtime;
const Rn = renderer;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAGMENT = 11;
let B = Rn.browserBackend;
/** Run `f` with `b` as the backend that new nodes are built with. */
function withB(b, f) {
    const prev = B;
    B = b;
    try {
        return f();
    }
    finally {
        B = prev;
    }
}
export const withBackend = (b) => (e) => () => withB(b, e);
// ---------------------------------------------------------------------------
// Attributes, as `Screamer.Attribute` builds them. The kinds must match
// Attribute.ts.
const PROPERTY = 0;
const ATTRIBUTE = 1;
const BOOLEAN = 2;
const STYLE = 3;
const EVENT = 4;
const GROUP = 5;
const UNSET = {};
/**
 * Set once for a constant, or with one owned effect for a signal. A signal
 * updates whenever its arguments do (#68), so the effect skips a write of
 * the value it wrote last: the DOM is at the edge of the graph, and nothing
 * in it can observe the skip.
 */
function bindValue(s, sig, set, shows) {
    if (R.isConstant(sig)) {
        set(sig.value);
        return;
    }
    if (shows !== undefined)
        R.registerCheck(s, () => shows(R.sample(sig)));
    let last = UNSET;
    R.effectIn(s, () => {
        const v = sig.read();
        if (Object.is(v, last))
            return;
        last = v;
        set(v);
    });
}
/** Whether bindings made now should register consistency checks (`DEV` only, and rarely on). */
const checks = (b) => R.development && b.interactive && R.consistencyChecking();
function bindAttr(b, s, el, a) {
    const name = a.name;
    switch (a.kind) {
        case PROPERTY:
            bindValue(s, a.value, (v) => { b.setProperty(el, name, v); });
            break;
        case ATTRIBUTE:
            bindValue(s, a.value, (v) => { b.setAttribute(el, name, v); }, checks(b) ? (v) => {
                const now = el.getAttribute(name);
                return now === v ? null : `attribute ${name} shows ${JSON.stringify(now)}, but its signal is ${JSON.stringify(v)}`;
            } : undefined);
            break;
        case BOOLEAN:
            bindValue(s, a.value, (v) => {
                if (v)
                    b.setAttribute(el, name, '');
                else
                    b.removeAttribute(el, name);
            }, checks(b) ? (v) => {
                const now = el.hasAttribute(name);
                return now === v ? null : `attribute ${name} is ${now ? 'present' : 'absent'}, but its signal is ${v}`;
            } : undefined);
            break;
        case STYLE:
            bindValue(s, a.value, (v) => { b.setStyle(el, name, v); });
            break;
        case EVENT:
            if (b.interactive)
                b.listen(el, name, a.value, s);
            break;
        case GROUP: {
            const list = a.value;
            for (let i = 0; i < list.length; i++)
                bindAttr(b, s, el, list[i]);
            break;
        }
    }
}
// ---------------------------------------------------------------------------
// Elements
function build(b, el, attrs, children, s) {
    b.enter(el);
    for (let i = 0; i < children.length; i++)
        b.appendChild(el, children[i](s)());
    b.leave(el);
    for (let i = 0; i < attrs.length; i++)
        bindAttr(b, s, el, attrs[i]);
    return el;
}
export const elementImpl = (tag) => (attrs) => (children) => (s) => () => build(B, B.createElement(tag), attrs, children, s);
export const svgElementImpl = (tag) => (attrs) => (children) => (s) => () => build(B, B.createElementNS(SVG_NS, tag), attrs, children, s);
/**
 * The host element of `foreign_`: its attributes, and no children. Any it
 * already has (a hydrating backend claims the server's fallback) are
 * cleared before the widget's setup runs.
 */
export const foreignHostImpl = (tag) => (attrs) => (s) => () => {
    const b = B;
    const el = b.createElement(tag);
    b.enter(el);
    if (b.firstChild(el) !== null)
        b.clearChildren(el);
    b.leave(el);
    for (let i = 0; i < attrs.length; i++)
        bindAttr(b, s, el, attrs[i]);
    return el;
};
export const fragmentImpl = (children) => (s) => () => {
    const b = B;
    const f = b.createFragment();
    for (let i = 0; i < children.length; i++)
        b.appendChild(f, children[i](s)());
    return f;
};
export const textImpl = (sig) => (s) => () => {
    const b = B;
    if (R.isConstant(sig))
        return b.createText(sig.value);
    const node = b.createText('');
    let last = UNSET;
    R.effectIn(s, () => {
        const v = sig.read();
        if (v === last)
            return;
        last = v;
        b.setText(node, v);
    });
    if (checks(b)) {
        R.registerCheck(s, () => {
            const v = R.sample(sig);
            return node.data === v ? null : `text node shows ${JSON.stringify(node.data)}, but its signal is ${JSON.stringify(v)}`;
        });
    }
    return node;
};
/**
 * Instantiate `el` with backend `b` in a fresh child scope of `parent`,
 * untracked. `kind` and `key` name the scope for development tools.
 */
function instantiateIn(b, parent, el, kind, key) {
    const scope = R.createScope(parent);
    R.tagScope(scope, kind, '', key);
    const node = withB(b, () => R.untracked(() => R.runInScope(scope, () => el(scope)())));
    if (R.development)
        R.setScopeNodes(scope, topLevel(b, node));
    return { scope, node };
}
function removeBetween(b, start, end, r = null) {
    const parent = b.parentNode(end);
    let n = b.nextSibling(start);
    while (n !== null && n !== end) {
        const next = b.nextSibling(n);
        if (r === null)
            b.removeChild(parent, n);
        else
            r.remove(parent, n);
        n = next;
    }
}
/** The default leave hook: detach at once. `dyn` and `each` skip the hook when it is this one. */
export const immediateLeave = () => (done) => () => () => done();
/** The default enter hook, which does nothing. `dyn` and `each` skip it. */
export const noEnter = () => () => () => { };
/** The default move hook, which does nothing. `each` measures nothing when it is this one. */
export const noMove = () => () => () => { };
/** Run an `Owned Unit` in a fresh child scope of `parent`, untracked. */
function runHook(parent, kind, body) {
    const c = R.createScope(parent);
    R.tagScope(c, kind);
    R.untracked(() => R.runInScope(c, () => body(c)()));
    return c;
}
const NO_KEY = {};
/**
 * Detaches the nodes of removed branches or rows. With a leave hook, each
 * top-level node stays in place until the hook calls its `done`, or until
 * the owning scope is disposed, whichever comes first. Each hook runs in
 * its own leaving scope, a child of the `dyn` or `each` scope, which is
 * disposed when the node is detached.
 */
class Remover {
    constructor(b, s, hook) {
        this.b = b;
        this.s = s;
        this.hook = hook;
        this.leaving = new Map();
        /** Leaving nodes by row key, for primitive keys; `each` finishes them when the key returns. */
        this.byKey = new Map();
    }
    static of(b, s, k) {
        const hook = b.interactive ? R.lookupContext(s, k.name, k.default) : immediateLeave;
        const r = new Remover(b, s, hook === immediateLeave ? null : hook);
        if (r.hook !== null)
            s.cleanups.push(() => r.flush());
        return r;
    }
    get delayed() {
        return this.hook !== null;
    }
    remove(parent, n, key = NO_KEY) {
        const hook = this.hook;
        if (hook === null) {
            this.b.removeChild(parent, n);
            return;
        }
        if (this.leaving.has(n))
            return;
        const l = { key, scope: null, running: true };
        this.leaving.set(n, l);
        if (key !== NO_KEY && isPrimitive(key)) {
            let set = this.byKey.get(key);
            if (set === undefined)
                this.byKey.set(key, (set = new Set()));
            set.add(n);
        }
        // `done` may be called while the hook is still running; the scope is
        // then disposed once the hook returns.
        try {
            l.scope = runHook(this.s, 'leave', hook(n)(() => this.finish(n)));
        }
        finally {
            l.running = false;
            if (!this.leaving.has(n) && l.scope !== null)
                l.scope.dispose();
        }
    }
    finish(n) {
        const l = this.leaving.get(n);
        if (l === undefined)
            return;
        this.leaving.delete(n);
        if (l.key !== NO_KEY && isPrimitive(l.key)) {
            const set = this.byKey.get(l.key);
            if (set !== undefined) {
                set.delete(n);
                if (set.size === 0)
                    this.byKey.delete(l.key);
            }
        }
        if (!l.running && l.scope !== null)
            l.scope.dispose();
        const p = this.b.parentNode(n);
        if (p !== null)
            this.b.removeChild(p, n);
    }
    /**
     * Finish at once the nodes still leaving from a row with this key: their
     * hooks' scopes are disposed and the nodes detached.
     */
    finishKey(key, compare) {
        if (this.leaving.size === 0)
            return;
        if (isPrimitive(key)) {
            const set = this.byKey.get(key);
            if (set !== undefined)
                for (const n of Array.from(set))
                    this.finish(n);
            return;
        }
        for (const [n, l] of Array.from(this.leaving)) {
            if (l.key !== NO_KEY && !isPrimitive(l.key) && compare(l.key)(key) === 0)
                this.finish(n);
        }
    }
    /** Detach every node still leaving. */
    flush() {
        for (const n of Array.from(this.leaving.keys()))
            this.finish(n);
    }
}
/** The top-level nodes of a built element, before it is inserted. */
function topLevel(b, node) {
    if (b.nodeType(node) !== FRAGMENT)
        return [node];
    const nodes = [];
    for (let n = b.firstChild(node); n !== null; n = b.nextSibling(n))
        nodes.push(n);
    return nodes;
}
/**
 * Runs the enter hook on the nodes of branches or rows once they are
 * inserted. The hook is skipped for the initial build unless it asks to
 * `appear`, and always when the initial build hydrates.
 */
class Enterer {
    constructor(hook, appear) {
        this.hook = hook;
        this.appear = appear;
    }
    static of(b, s, k) {
        const e = b.interactive ? R.lookupContext(s, k.name, k.default) : k.default;
        const hook = e.hook === noEnter ? null : e.hook;
        return new Enterer(hook, e.appear && b.hydrating !== true);
    }
    /** Whether to run the hook for nodes built by the initial build (`initial`) or a later one. */
    runs(initial) {
        return this.hook !== null && (!initial || this.appear);
    }
    run(scope, nodes) {
        const hook = this.hook;
        for (let i = 0; i < nodes.length; i++) {
            if (scope.disposed)
                return;
            runHook(scope, 'enter', hook(nodes[i]));
        }
    }
}
function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height, x: r.x, y: r.y };
}
/** A fragment holding a pair of anchors, for a range that changes. */
function anchors(b) {
    const start = b.createAnchor(true);
    const end = b.createAnchor(false);
    const f = b.createFragment();
    b.appendChild(f, start);
    b.appendChild(f, end);
    return { start, end, f };
}
export const dynImpl = (hooks) => (sig) => (s) => () => {
    if (R.isConstant(sig))
        return sig.value(s)();
    const b = B;
    const { start, end, f } = anchors(b);
    const remover = Remover.of(b, s, hooks.leave);
    const enterer = Enterer.of(b, s, hooks.enter);
    let child = null;
    let initial = true;
    R.effectIn(s, () => {
        const el = sig.read();
        R.untracked(() => {
            if (child !== null)
                child.dispose();
            child = null;
            removeBetween(b, start, end, remover);
            const made = instantiateIn(b, s, el, 'dyn');
            child = made.scope;
            const entering = enterer.runs(initial) ? topLevel(b, made.node) : null;
            initial = false;
            b.insertBefore(b.parentNode(end), made.node, end);
            if (entering !== null)
                enterer.run(made.scope, entering);
        });
    });
    return f;
};
/** Indices of a longest strictly increasing subsequence of `xs`, ignoring negative entries. */
function longestIncreasingSubsequence(xs) {
    const n = xs.length;
    const prev = new Int32Array(n);
    const tails = []; // indices into xs
    for (let i = 0; i < n; i++) {
        const x = xs[i];
        if (x < 0)
            continue;
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (xs[tails[mid]] < x)
                lo = mid + 1;
            else
                hi = mid;
        }
        prev[i] = lo > 0 ? tails[lo - 1] : -1;
        tails[lo] = i;
    }
    const keep = new Uint8Array(n);
    let k = tails.length > 0 ? tails[tails.length - 1] : -1;
    while (k >= 0) {
        keep[k] = 1;
        k = prev[k];
    }
    return keep;
}
function isPrimitive(k) {
    const t = typeof k;
    return t === 'string' || t === 'number' || t === 'boolean';
}
/** Find old row indices by key: a Map for primitive keys, binary search with `compare` otherwise. */
function keyLookup(rows, compare) {
    if (rows.length === 0)
        return () => -1;
    if (isPrimitive(rows[0].key)) {
        const m = new Map();
        for (let i = rows.length - 1; i >= 0; i--)
            m.set(rows[i].key, i);
        return (k) => {
            const i = m.get(k);
            return i === undefined ? -1 : i;
        };
    }
    const order = rows.map((_, i) => i).sort((a, b) => compare(rows[a].key)(rows[b].key));
    return (k) => {
        let lo = 0;
        let hi = order.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const c = compare(rows[order[mid]].key)(k);
            if (c < 0)
                lo = mid + 1;
            else if (c > 0)
                hi = mid;
            else
                return order[mid];
        }
        return -1;
    };
}
function moveBefore(b, parent, row, next) {
    if (b.nextSibling(row.last) === next)
        return;
    if (row.first === row.last) {
        b.insertBefore(parent, row.first, next);
        return;
    }
    let n = row.first;
    for (;;) {
        const after = b.nextSibling(n);
        b.insertBefore(parent, n, next);
        if (n === row.last)
            break;
        n = after;
    }
}
function removeRow(b, parent, row, r) {
    let n = row.first;
    for (;;) {
        const after = b.nextSibling(n);
        r.remove(parent, n, row.key);
        if (n === row.last || after === null)
            break;
        n = after;
    }
}
/** The top-level nodes of a row, in order. */
function rowNodes(b, row) {
    const nodes = [];
    let n = row.first;
    for (;;) {
        nodes.push(n);
        if (n === row.last)
            break;
        n = b.nextSibling(n);
        if (n === null)
            break;
    }
    return nodes;
}
const ELEMENT = 1;
/** The rects of a row's top-level elements, in order. */
function measureRow(b, row) {
    const nodes = rowNodes(b, row);
    const rects = [];
    for (let i = 0; i < nodes.length; i++)
        if (b.nodeType(nodes[i]) === ELEMENT)
            rects.push(rectOf(nodes[i]));
    return rects;
}
export const eachImpl = (hooks) => (compare) => (keyOf) => (items) => (render) => (s) => () => {
    const b = B;
    const { start, end, f } = anchors(b);
    const remover = Remover.of(b, s, hooks.leave);
    const enterer = Enterer.of(b, s, hooks.enter);
    const moveHook = b.interactive ? R.lookupContext(s, hooks.move.name, hooks.move.default) : noMove;
    const mover = moveHook === noMove ? null : moveHook;
    let rows = [];
    let initial = true;
    // Rows built by the current reconcile, for the enter hook.
    let entered = null;
    const makeRow = (key, item, into, before) => {
        if (remover.delayed)
            remover.finishKey(key, compare);
        const cell = R.cell(item);
        const { scope, node } = instantiateIn(b, s, render(cell), 'each', key);
        let first;
        let last;
        if (b.nodeType(node) === FRAGMENT) {
            if (b.firstChild(node) === null)
                b.appendChild(node, b.createComment(''));
            first = b.firstChild(node);
            last = b.lastChild(node);
        }
        else {
            first = node;
            last = node;
        }
        b.insertBefore(into, node, before);
        const row = { key, cell, scope, first, last, move: null };
        if (entered !== null)
            entered.push(row);
        return row;
    };
    const createAll = (list) => {
        const frag = b.createFragment();
        const made = new Array(list.length);
        for (let i = 0; i < list.length; i++)
            made[i] = makeRow(keyOf(list[i]), list[i], frag, null);
        b.insertBefore(b.parentNode(end), frag, end);
        return made;
    };
    const clearAll = () => {
        for (let i = rows.length - 1; i >= 0; i--)
            rows[i].scope.dispose();
        const parent = b.parentNode(end);
        if (remover.delayed) {
            for (let i = 0; i < rows.length; i++)
                removeRow(b, parent, rows[i], remover);
        }
        else if (b.firstChild(parent) === start && b.lastChild(parent) === end && b.nodeType(parent) !== FRAGMENT) {
            // The list owns its parent: replace the children wholesale.
            b.clearChildren(parent);
            b.appendChild(parent, start);
            b.appendChild(parent, end);
        }
        else {
            removeBetween(b, start, end);
        }
        rows = [];
    };
    const reconcileNodes = (list) => {
        const n = list.length;
        if (n === 0) {
            if (rows.length > 0)
                clearAll();
            return;
        }
        if (rows.length === 0) {
            rows = createAll(list);
            return;
        }
        const parent = b.parentNode(end);
        // Common prefix and suffix: rows that stay in place.
        const m = rows.length;
        let head = 0;
        while (head < n && head < m && compare(keyOf(list[head]))(rows[head].key) === 0) {
            rows[head].cell.putT1(list[head]);
            head++;
        }
        let tailNew = n;
        let tailOld = m;
        while (tailNew > head && tailOld > head && compare(keyOf(list[tailNew - 1]))(rows[tailOld - 1].key) === 0) {
            rows[tailOld - 1].cell.putT1(list[tailNew - 1]);
            tailNew--;
            tailOld--;
        }
        if (head === tailNew) {
            // Only removals in the middle.
            for (let j = head; j < tailOld; j++) {
                rows[j].scope.dispose();
                removeRow(b, parent, rows[j], remover);
            }
            if (tailOld > head)
                rows.splice(head, tailOld - head);
            return;
        }
        if (head === tailOld) {
            // Only insertions in the middle.
            const anchor = tailOld < m ? rows[tailOld].first : end;
            const frag = b.createFragment();
            const made = new Array(tailNew - head);
            for (let i = head; i < tailNew; i++)
                made[i - head] = makeRow(keyOf(list[i]), list[i], frag, null);
            b.insertBefore(parent, frag, anchor);
            rows = rows.slice(0, head).concat(made, rows.slice(head));
            return;
        }
        const lookup = keyLookup(rows, compare);
        const used = new Uint8Array(rows.length);
        const oldIndex = new Int32Array(n);
        const keys = new Array(n);
        const next = new Array(n);
        let kept = 0;
        for (let i = 0; i < n; i++) {
            const key = keyOf(list[i]);
            keys[i] = key;
            const j = lookup(key);
            if (j >= 0 && used[j] === 0) {
                used[j] = 1;
                oldIndex[i] = j;
                next[i] = rows[j];
                kept++;
            }
            else {
                oldIndex[i] = -1;
                next[i] = null;
            }
        }
        if (kept === 0) {
            clearAll();
            rows = createAll(list);
            return;
        }
        for (let j = 0; j < rows.length; j++) {
            if (used[j] === 0) {
                rows[j].scope.dispose();
                removeRow(b, parent, rows[j], remover);
            }
        }
        const stay = longestIncreasingSubsequence(oldIndex);
        let anchor = end;
        for (let i = n - 1; i >= 0; i--) {
            let row = next[i];
            if (row === null) {
                row = makeRow(keys[i], list[i], parent, anchor);
                next[i] = row;
            }
            else {
                row.cell.putT1(list[i]);
                if (stay[i] === 0)
                    moveBefore(b, parent, row, anchor);
            }
            anchor = row.first;
        }
        rows = next;
    };
    /**
     * Run the move hook on each top-level element of a kept row whose rect
     * changed. A move still running on the row is disposed first, so the
     * new rect is measured without it.
     */
    const moved = (row, before) => {
        if (row.move !== null) {
            row.move.dispose();
            row.move = null;
        }
        const nodes = rowNodes(b, row);
        let scope = null;
        for (let i = 0, j = 0; i < nodes.length; i++) {
            if (b.nodeType(nodes[i]) !== ELEMENT)
                continue;
            const was = before[j++];
            if (was === undefined)
                break;
            const now = rectOf(nodes[i]);
            if (was.left === now.left && was.top === now.top && was.width === now.width && was.height === now.height)
                continue;
            if (scope === null) {
                scope = R.createScope(row.scope);
                R.tagScope(scope, 'move');
            }
            const c = scope;
            const hook = mover({ node: nodes[i], before: was, after: now });
            R.untracked(() => R.runInScope(c, () => hook(c)()));
        }
        row.move = scope;
    };
    const reconcile = (list) => {
        const runEnter = enterer.runs(initial);
        initial = false;
        entered = runEnter ? [] : null;
        // A copy: removals splice `rows` in place.
        const old = mover !== null && rows.length > 0 && list.length > 0 ? rows.slice() : null;
        const rects = old !== null ? old.map((row) => measureRow(b, row)) : null;
        reconcileNodes(list);
        if (old !== null) {
            const kept = new Set(rows);
            for (let i = 0; i < old.length; i++)
                if (kept.has(old[i]))
                    moved(old[i], rects[i]);
        }
        if (entered !== null) {
            // In document order: a reorder builds rows from the end.
            const made = new Set(entered);
            entered = null;
            if (made.size === 0)
                return;
            const now = rows;
            for (let i = 0; i < now.length; i++)
                if (made.has(now[i]))
                    enterer.run(now[i].scope, rowNodes(b, now[i]));
        }
    };
    R.effectIn(s, () => {
        const list = items.read();
        R.untracked(() => reconcile(list));
    });
    return f;
};
// ---------------------------------------------------------------------------
// Names
export const namedImpl = (name) => (el) => (s) => () => {
    const scope = R.createScope(s);
    R.tagScope(scope, 'named', name);
    const node = R.untracked(() => R.runInScope(scope, () => el(scope)()));
    if (R.development)
        R.setScopeNodes(scope, topLevel(B, node));
    return node;
};
/** Record, for development tools, the top-level nodes an element built in `s`. */
export const recordNodes = (b) => (s) => (node) => () => {
    if (R.development)
        R.setScopeNodes(s, topLevel(b, node));
};
// ---------------------------------------------------------------------------
// Portals, error boundaries and suspense
export const portalImpl = (selector) => (el) => (s) => () => {
    const b = B;
    const target = b.select(selector);
    if (target === null)
        throw new Error(`portal: no element matches "${selector}"`);
    const { scope, node } = instantiateIn(b, s, el, 'portal');
    scope.cleanups.push(attachRange(b, target, node));
    return b.createComment('');
};
const toError = (e) => (e instanceof Error ? e : new Error(String(e)));
export const catchErrorImpl = (handler) => (el) => (s) => () => {
    const b = B;
    const { start, end, f } = anchors(b);
    const scope = R.createScope(s);
    R.tagScope(scope, 'catchError');
    let failed = false;
    // Replace the child with the handler's element. Errors from the handler's
    // element are not caught here: its scope is a sibling of the child's.
    const recover = (e) => {
        failed = true;
        scope.onError = null;
        scope.dispose();
        removeBetween(b, start, end);
        const made = instantiateIn(b, s, handler(toError(e)), 'fallback');
        b.insertBefore(b.parentNode(end), made.node, end);
    };
    scope.onError = recover;
    let node = null;
    try {
        node = withB(b, () => R.untracked(() => R.runInScope(scope, () => el(scope)())));
    }
    catch (e) {
        // Once an effect has failed and been recovered from, the rest of the
        // build fails on the disposed scope; that is not a new error.
        if (!failed)
            recover(e);
    }
    if (!failed) {
        if (R.development)
            R.setScopeNodes(scope, topLevel(b, node));
        b.insertBefore(f, node, end);
    }
    return f;
};
export const suspenseImpl = (settledIn) => (boundary) => (fallback) => (content) => (s) => () => {
    const b = B;
    const { start, end, f } = anchors(b);
    const scope = R.createScope(s);
    R.tagScope(scope, 'suspense');
    const settled = settledIn(scope)();
    R.lookupContext(s, boundary.name, boundary.default)({ start, end, settled })();
    // The content builds detached, so its pending work starts at once.
    const node = withB(b, () => R.untracked(() => R.runInScope(scope, () => content(scope)())));
    if (R.development)
        R.setScopeNodes(scope, topLevel(b, node));
    if (R.sample(settled)) {
        b.insertBefore(f, node, end);
        return f;
    }
    const shown = instantiateIn(b, s, fallback, 'fallback');
    b.insertBefore(f, shown.node, end);
    const watch = R.createScope(s);
    R.tagScope(watch, 'watch');
    R.effectIn(watch, () => {
        if (!settled.read())
            return;
        R.untracked(() => {
            watch.dispose();
            shown.scope.dispose();
            removeBetween(b, start, end);
            b.insertBefore(b.parentNode(end), node, end);
        });
    });
    return f;
};
// ---------------------------------------------------------------------------
// Mounting
export const findMountPoint = (b) => (selector) => () => {
    const target = b.select(selector);
    if (target === null)
        throw new Error(`mount: no element matches "${selector}"`);
    return target;
};
/** Append `node` to `target`; the returned action removes what was appended. */
function attachRange(b, target, node) {
    let first = node;
    let last = node;
    if (b.nodeType(node) === FRAGMENT) {
        first = b.firstChild(node);
        last = b.lastChild(node);
    }
    b.appendChild(target, node);
    return () => {
        // Remove the whole range, including content a list or `dyn` added
        // between top-level anchors.
        let n = first;
        while (n !== null) {
            const after = b.nextSibling(n);
            const parent = b.parentNode(n);
            if (parent !== null)
                b.removeChild(parent, n);
            if (n === last)
                break;
            n = after;
        }
    };
}
export const attach = (b) => (target) => (node) => () => attachRange(b, target, node);
