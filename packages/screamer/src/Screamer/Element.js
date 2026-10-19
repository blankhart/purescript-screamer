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
/** Set once for a constant, or with one owned effect for a signal. */
function bindValue(s, sig, set) {
    if (R.isConstant(sig))
        set(sig.value);
    else
        R.effectIn(s, () => set(sig.read()));
}
function bindAttr(b, s, el, a) {
    const name = a.name;
    switch (a.kind) {
        case PROPERTY:
            bindValue(s, a.value, (v) => { b.setProperty(el, name, v); });
            break;
        case ATTRIBUTE:
            bindValue(s, a.value, (v) => { b.setAttribute(el, name, v); });
            break;
        case BOOLEAN:
            bindValue(s, a.value, (v) => {
                if (v)
                    b.setAttribute(el, name, '');
                else
                    b.removeAttribute(el, name);
            });
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
    R.effectIn(s, () => { b.setText(node, sig.read()); });
    return node;
};
/** Instantiate `el` with backend `b` in a fresh child scope of `parent`, untracked. */
function instantiateIn(b, parent, el) {
    const scope = R.createScope(parent);
    const node = withB(b, () => R.untracked(() => R.runInScope(scope, () => el(scope)())));
    return { scope, node };
}
function removeBetween(b, start, end) {
    const parent = b.parentNode(end);
    let n = b.nextSibling(start);
    while (n !== null && n !== end) {
        const next = b.nextSibling(n);
        b.removeChild(parent, n);
        n = next;
    }
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
export const dynImpl = (sig) => (s) => () => {
    if (R.isConstant(sig))
        return sig.value(s)();
    const b = B;
    const { start, end, f } = anchors(b);
    let child = null;
    R.effectIn(s, () => {
        const el = sig.read();
        R.untracked(() => {
            if (child !== null)
                child.dispose();
            child = null;
            removeBetween(b, start, end);
            const made = instantiateIn(b, s, el);
            child = made.scope;
            b.insertBefore(b.parentNode(end), made.node, end);
        });
    });
    return f;
};
/** Indices of a longest strictly increasing subsequence of `xs`, ignoring negative entries. */
export function longestIncreasingSubsequence(xs) {
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
function removeRow(b, parent, row) {
    let n = row.first;
    for (;;) {
        const after = b.nextSibling(n);
        b.removeChild(parent, n);
        if (n === row.last || after === null)
            break;
        n = after;
    }
}
export const eachImpl = (compare) => (keyOf) => (items) => (render) => (s) => () => {
    const b = B;
    const { start, end, f } = anchors(b);
    let rows = [];
    const makeRow = (key, item, into, before) => {
        const cell = R.cell(item);
        const { scope, node } = instantiateIn(b, s, render(cell));
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
        return { key, cell, scope, first, last };
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
        if (b.firstChild(parent) === start && b.lastChild(parent) === end && b.nodeType(parent) !== FRAGMENT) {
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
    const reconcile = (list) => {
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
            rows[head].cell.write(list[head]);
            head++;
        }
        let tailNew = n;
        let tailOld = m;
        while (tailNew > head && tailOld > head && compare(keyOf(list[tailNew - 1]))(rows[tailOld - 1].key) === 0) {
            rows[tailOld - 1].cell.write(list[tailNew - 1]);
            tailNew--;
            tailOld--;
        }
        if (head === tailNew) {
            // Only removals in the middle.
            for (let j = head; j < tailOld; j++) {
                rows[j].scope.dispose();
                removeRow(b, parent, rows[j]);
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
                removeRow(b, parent, rows[j]);
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
                row.cell.write(list[i]);
                if (stay[i] === 0)
                    moveBefore(b, parent, row, anchor);
            }
            anchor = row.first;
        }
        rows = next;
    };
    R.effectIn(s, () => {
        const list = items.read();
        R.untracked(() => reconcile(list));
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
