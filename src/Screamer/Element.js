// @ts-ignore: purs copies this file to output/Screamer.Element/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAGMENT = 11;
// ---------------------------------------------------------------------------
// Attributes
const PROPERTY = 0;
const ATTRIBUTE = 1;
const BOOLEAN = 2;
const STYLE = 3;
const EVENT = 4;
const GROUP = 5;
export const property = (name) => (value) => ({ kind: PROPERTY, name, value });
export const attribute = (name) => (value) => ({ kind: ATTRIBUTE, name, value });
export const booleanAttribute = (name) => (value) => ({ kind: BOOLEAN, name, value });
export const styleProperty = (name) => (value) => ({ kind: STYLE, name, value });
export const on_ = (name) => (handler) => ({ kind: EVENT, name, value: handler });
export const unsafeOn_ = on_;
export const attributes = (list) => ({ kind: GROUP, name: '', value: list });
// Bubbling events are delegated: one listener per event type on the document
// dispatches to the handlers stored on the elements between the target and
// the document. Elements need no listener of their own, so creating and
// disposing them adds and removes none. A handler stops firing once the scope
// that bound it is disposed.
const DELEGATED = new Set([
    'beforeinput', 'click', 'contextmenu', 'dblclick', 'focusin', 'focusout', 'input',
    'keydown', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup',
    'pointerdown', 'pointermove', 'pointerout', 'pointerover', 'pointerup',
    'touchend', 'touchmove', 'touchstart',
]);
const HANDLERS = '$$screamer';
const delegated = new Set();
function delegate(name) {
    if (delegated.has(name))
        return;
    delegated.add(name);
    document.addEventListener(name, dispatch);
}
function dispatch(e) {
    const name = e.type;
    let node = e.target;
    Object.defineProperty(e, 'currentTarget', { configurable: true, get: () => node });
    try {
        R.batch(() => {
            while (node !== null) {
                const h = node[HANDLERS];
                if (h !== undefined && !h.scope.disposed) {
                    const handler = h.on[name];
                    if (handler !== undefined) {
                        handler(e)();
                        if (e.cancelBubble)
                            return;
                    }
                }
                node = node.parentNode ?? (node.host || null);
            }
        });
    }
    finally {
        delete e.currentTarget;
    }
}
/** Set once for a constant, or with one owned effect for a signal. */
function bindValue(s, sig, set) {
    if (R.isConstant(sig))
        set(sig.value);
    else
        R.effectIn(s, () => set(sig.read()));
}
function bindAttr(s, el, a) {
    const name = a.name;
    switch (a.kind) {
        case PROPERTY:
            // Skip writes that would not change the property, so an input's caret
            // and partial entry survive the value it just reported being written back.
            bindValue(s, a.value, (v) => { if (el[name] !== v)
                el[name] = v; });
            break;
        case ATTRIBUTE:
            bindValue(s, a.value, (v) => { el.setAttribute(name, v); });
            break;
        case BOOLEAN:
            bindValue(s, a.value, (v) => {
                if (v)
                    el.setAttribute(name, '');
                else
                    el.removeAttribute(name);
            });
            break;
        case STYLE: {
            const style = el.style;
            bindValue(s, a.value, (v) => { style.setProperty(name, v); });
            break;
        }
        case EVENT: {
            const handler = a.value;
            if (DELEGATED.has(name)) {
                delegate(name);
                let h = el[HANDLERS];
                if (h === undefined)
                    h = el[HANDLERS] = { scope: s, on: Object.create(null) };
                h.on[name] = handler;
            }
            else {
                const listener = (e) => R.batch(() => handler(e)());
                el.addEventListener(name, listener);
                s.cleanups.push(() => el.removeEventListener(name, listener));
            }
            break;
        }
        case GROUP: {
            const list = a.value;
            for (let i = 0; i < list.length; i++)
                bindAttr(s, el, list[i]);
            break;
        }
    }
}
// ---------------------------------------------------------------------------
// Elements
function build(el, attrs, children, s) {
    for (let i = 0; i < children.length; i++)
        el.appendChild(children[i](s)());
    for (let i = 0; i < attrs.length; i++)
        bindAttr(s, el, attrs[i]);
    return el;
}
export const elementImpl = (tag) => (attrs) => (children) => (s) => () => build(document.createElement(tag), attrs, children, s);
export const svgElementImpl = (tag) => (attrs) => (children) => (s) => () => build(document.createElementNS(SVG_NS, tag), attrs, children, s);
export const fragmentImpl = (children) => (s) => () => {
    const f = document.createDocumentFragment();
    for (let i = 0; i < children.length; i++)
        f.appendChild(children[i](s)());
    return f;
};
export const textImpl = (sig) => (s) => () => {
    if (R.isConstant(sig))
        return document.createTextNode(sig.value);
    const node = document.createTextNode('');
    R.effectIn(s, () => { node.data = sig.read(); });
    return node;
};
/** Instantiate `el` in a fresh child scope of `parent`, untracked. */
function instantiateIn(parent, el) {
    const scope = R.createScope(parent);
    const node = R.untracked(() => R.runInScope(scope, () => el(scope)()));
    return { scope, node };
}
function removeBetween(start, end) {
    const parent = end.parentNode;
    let n = start.nextSibling;
    while (n !== null && n !== end) {
        const next = n.nextSibling;
        parent.removeChild(n);
        n = next;
    }
}
export const dynImpl = (sig) => (s) => () => {
    if (R.isConstant(sig))
        return sig.value(s)();
    const start = document.createComment('');
    const end = document.createComment('');
    const f = document.createDocumentFragment();
    f.appendChild(start);
    f.appendChild(end);
    let child = null;
    R.effectIn(s, () => {
        const el = sig.read();
        R.untracked(() => {
            if (child !== null)
                child.dispose();
            child = null;
            removeBetween(start, end);
            const made = instantiateIn(s, el);
            child = made.scope;
            end.parentNode.insertBefore(made.node, end);
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
function moveBefore(parent, row, next) {
    if (row.last.nextSibling === next)
        return;
    if (row.first === row.last) {
        parent.insertBefore(row.first, next);
        return;
    }
    let n = row.first;
    for (;;) {
        const after = n.nextSibling;
        parent.insertBefore(n, next);
        if (n === row.last)
            break;
        n = after;
    }
}
function removeRow(parent, row) {
    let n = row.first;
    for (;;) {
        const after = n.nextSibling;
        parent.removeChild(n);
        if (n === row.last || after === null)
            break;
        n = after;
    }
}
export const eachImpl = (compare) => (keyOf) => (items) => (render) => (s) => () => {
    const start = document.createComment('');
    const end = document.createComment('');
    const f = document.createDocumentFragment();
    f.appendChild(start);
    f.appendChild(end);
    let rows = [];
    const makeRow = (key, item, into, before) => {
        const cell = R.cell(item);
        const { scope, node } = instantiateIn(s, render(cell));
        let first;
        let last;
        if (node.nodeType === FRAGMENT) {
            if (node.firstChild === null)
                node.appendChild(document.createComment(''));
            first = node.firstChild;
            last = node.lastChild;
        }
        else {
            first = node;
            last = node;
        }
        into.insertBefore(node, before);
        return { key, cell, scope, first, last };
    };
    const createAll = (list) => {
        const frag = document.createDocumentFragment();
        const made = new Array(list.length);
        for (let i = 0; i < list.length; i++)
            made[i] = makeRow(keyOf(list[i]), list[i], frag, null);
        end.parentNode.insertBefore(frag, end);
        return made;
    };
    const clearAll = () => {
        for (let i = rows.length - 1; i >= 0; i--)
            rows[i].scope.dispose();
        const parent = end.parentNode;
        if (parent.firstChild === start && parent.lastChild === end && parent.nodeType !== FRAGMENT) {
            // The list owns its parent: replace the children wholesale.
            parent.textContent = '';
            parent.appendChild(start);
            parent.appendChild(end);
        }
        else {
            removeBetween(start, end);
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
        const parent = end.parentNode;
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
                removeRow(parent, rows[j]);
            }
            if (tailOld > head)
                rows.splice(head, tailOld - head);
            return;
        }
        if (head === tailOld) {
            // Only insertions in the middle.
            const anchor = tailOld < m ? rows[tailOld].first : end;
            const frag = document.createDocumentFragment();
            const made = new Array(tailNew - head);
            for (let i = head; i < tailNew; i++)
                made[i - head] = makeRow(keyOf(list[i]), list[i], frag, null);
            parent.insertBefore(frag, anchor);
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
                removeRow(parent, rows[j]);
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
                    moveBefore(parent, row, anchor);
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
export const findMountPoint = (selector) => () => {
    const target = document.querySelector(selector);
    if (target === null)
        throw new Error(`mount: no element matches "${selector}"`);
    return target;
};
/** Append `node` to `target`; the returned action removes what was appended. */
export const attach = (target) => (node) => () => {
    let first = node;
    let last = node;
    if (node.nodeType === FRAGMENT) {
        first = node.firstChild;
        last = node.lastChild;
    }
    target.appendChild(node);
    return () => {
        // Remove the whole range, including content a list or `dyn` added
        // between top-level anchors.
        let n = first;
        while (n !== null) {
            const after = n.nextSibling;
            n.parentNode?.removeChild(n);
            if (n === last)
                break;
            n = after;
        }
    };
};
