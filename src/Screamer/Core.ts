// Foreign module of Screamer.Core: the DOM layer.
//
// An Element is an `Owned Node`; at run time that is a function from a scope
// to an effect producing the node. Instantiating it creates the DOM nodes and
// the effects that keep them up to date, all owned by that scope.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Core/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

type Scope = Core.Scope;
type Sig<T> = Core.Readable<T>;
type El = (s: Scope) => () => Node;

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

interface Attr {
  kind: number;
  name: string;
  value: any;
}

export const property = (name: string) => (value: Sig<any>): Attr => ({ kind: PROPERTY, name, value });

export const attribute = (name: string) => (value: Sig<string>): Attr => ({ kind: ATTRIBUTE, name, value });

export const booleanAttribute = (name: string) => (value: Sig<boolean>): Attr => ({ kind: BOOLEAN, name, value });

export const styleProperty = (name: string) => (value: Sig<string>): Attr => ({ kind: STYLE, name, value });

export const on_ = (name: string) => (handler: (e: Event) => () => void): Attr => ({ kind: EVENT, name, value: handler });

export const unsafeOn_ = on_;

export const attributes = (list: Attr[]): Attr => ({ kind: GROUP, name: '', value: list });

/** Set once for a constant, or with one owned effect for a signal. */
function bindValue<T>(s: Scope, sig: Sig<T>, set: (v: T) => void): void {
  if (sig instanceof R.Constant) set(sig.value);
  else R.effectIn(s, () => set(sig.read()));
}

function bindAttr(s: Scope, el: Element, a: Attr): void {
  const name = a.name;
  switch (a.kind) {
    case PROPERTY:
      bindValue(s, a.value, (v) => { (el as any)[name] = v; });
      break;
    case ATTRIBUTE:
      bindValue(s, a.value, (v: string) => { el.setAttribute(name, v); });
      break;
    case BOOLEAN:
      bindValue(s, a.value, (v: boolean) => {
        if (v) el.setAttribute(name, '');
        else el.removeAttribute(name);
      });
      break;
    case STYLE: {
      const style = (el as HTMLElement).style;
      bindValue(s, a.value, (v: string) => { style.setProperty(name, v); });
      break;
    }
    case EVENT: {
      const handler = a.value as (e: Event) => () => void;
      const listener = (e: Event) => R.batch(() => handler(e)());
      el.addEventListener(name, listener);
      s.cleanups.push(() => el.removeEventListener(name, listener));
      break;
    }
    case GROUP: {
      const list = a.value as Attr[];
      for (let i = 0; i < list.length; i++) bindAttr(s, el, list[i]);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Elements

function build(el: Element, attrs: Attr[], children: El[], s: Scope): Element {
  for (let i = 0; i < children.length; i++) el.appendChild(children[i](s)());
  for (let i = 0; i < attrs.length; i++) bindAttr(s, el, attrs[i]);
  return el;
}

export const elementImpl = (tag: string) => (attrs: Attr[]) => (children: El[]) => (s: Scope) => (): Node =>
  build(document.createElement(tag), attrs, children, s);

export const svgElementImpl = (tag: string) => (attrs: Attr[]) => (children: El[]) => (s: Scope) => (): Node =>
  build(document.createElementNS(SVG_NS, tag), attrs, children, s);

export const fragmentImpl = (children: El[]) => (s: Scope) => (): Node => {
  const f = document.createDocumentFragment();
  for (let i = 0; i < children.length; i++) f.appendChild(children[i](s)());
  return f;
};

export const textImpl = (sig: Sig<string>) => (s: Scope) => (): Node => {
  if (sig instanceof R.Constant) return document.createTextNode(sig.value);
  const node = document.createTextNode('');
  R.effectIn(s, () => { node.data = sig.read(); });
  return node;
};

/** Instantiate `el` in a fresh child scope of `parent`, untracked. */
function instantiateIn(parent: Scope, el: El): { scope: Scope; node: Node } {
  const scope = R.createScope(parent);
  const node = R.untracked(() => R.runInScope(scope, () => el(scope)()));
  return { scope, node };
}

function removeBetween(start: Node, end: Node): void {
  const parent = end.parentNode!;
  let n = start.nextSibling;
  while (n !== null && n !== end) {
    const next: ChildNode | null = n.nextSibling;
    parent.removeChild(n);
    n = next;
  }
}

export const dynImpl = (sig: Sig<El>) => (s: Scope) => (): Node => {
  if (sig instanceof R.Constant) return sig.value(s)();
  const start = document.createComment('');
  const end = document.createComment('');
  const f = document.createDocumentFragment();
  f.appendChild(start);
  f.appendChild(end);
  let child: Scope | null = null;
  R.effectIn(s, () => {
    const el = sig.read();
    R.untracked(() => {
      if (child !== null) child.dispose();
      child = null;
      removeBetween(start, end);
      const made = instantiateIn(s, el);
      child = made.scope;
      end.parentNode!.insertBefore(made.node, end);
    });
  });
  return f;
};

// ---------------------------------------------------------------------------
// Keyed lists

interface Row<A> {
  key: any;
  cell: Core.Cell<A>;
  scope: Scope;
  first: Node;
  last: Node;
}

/** Indices of a longest strictly increasing subsequence of `xs`, ignoring negative entries. */
export function longestIncreasingSubsequence(xs: ArrayLike<number>): Uint8Array {
  const n = xs.length;
  const prev = new Int32Array(n);
  const tails: number[] = []; // indices into xs
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    if (x < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[tails[mid]] < x) lo = mid + 1;
      else hi = mid;
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

function isPrimitive(k: unknown): boolean {
  const t = typeof k;
  return t === 'string' || t === 'number' || t === 'boolean';
}

/** Find old row indices by key: a Map for primitive keys, binary search with `compare` otherwise. */
function keyLookup(rows: Row<any>[], compare: (a: any) => (b: any) => number): (k: any) => number {
  if (rows.length === 0) return () => -1;
  if (isPrimitive(rows[0].key)) {
    const m = new Map<any, number>();
    for (let i = rows.length - 1; i >= 0; i--) m.set(rows[i].key, i);
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
      if (c < 0) lo = mid + 1;
      else if (c > 0) hi = mid;
      else return order[mid];
    }
    return -1;
  };
}

function moveBefore(parent: Node, row: Row<any>, next: Node): void {
  if (row.last.nextSibling === next) return;
  if (row.first === row.last) {
    parent.insertBefore(row.first, next);
    return;
  }
  let n: Node = row.first;
  for (;;) {
    const after = n.nextSibling!;
    parent.insertBefore(n, next);
    if (n === row.last) break;
    n = after;
  }
}

function removeRow(parent: Node, row: Row<any>): void {
  let n: Node = row.first;
  for (;;) {
    const after = n.nextSibling;
    parent.removeChild(n);
    if (n === row.last || after === null) break;
    n = after;
  }
}

export const eachImpl =
  <A, K>(compare: (a: K) => (b: K) => number) =>
  (keyOf: (a: A) => K) =>
  (items: Sig<A[]>) =>
  (render: (s: Sig<A>) => El) =>
  (s: Scope) =>
  (): Node => {
    const start = document.createComment('');
    const end = document.createComment('');
    const f = document.createDocumentFragment();
    f.appendChild(start);
    f.appendChild(end);
    let rows: Row<A>[] = [];

    const makeRow = (key: K, item: A, into: Node, before: Node | null): Row<A> => {
      const cell = R.cell(item);
      const { scope, node } = instantiateIn(s, render(cell));
      let first: Node;
      let last: Node;
      if (node.nodeType === FRAGMENT) {
        if (node.firstChild === null) node.appendChild(document.createComment(''));
        first = node.firstChild!;
        last = node.lastChild!;
      } else {
        first = node;
        last = node;
      }
      into.insertBefore(node, before);
      return { key, cell, scope, first, last };
    };

    const createAll = (list: A[]): Row<A>[] => {
      const frag = document.createDocumentFragment();
      const made = new Array<Row<A>>(list.length);
      for (let i = 0; i < list.length; i++) made[i] = makeRow(keyOf(list[i]), list[i], frag, null);
      end.parentNode!.insertBefore(frag, end);
      return made;
    };

    const clearAll = () => {
      for (let i = rows.length - 1; i >= 0; i--) rows[i].scope.dispose();
      const parent = end.parentNode!;
      if (parent.firstChild === start && parent.lastChild === end && parent.nodeType !== FRAGMENT) {
        // The list owns its parent: replace the children wholesale.
        (parent as Element).textContent = '';
        parent.appendChild(start);
        parent.appendChild(end);
      } else {
        removeBetween(start, end);
      }
      rows = [];
    };

    const reconcile = (list: A[]) => {
      const n = list.length;
      if (n === 0) {
        if (rows.length > 0) clearAll();
        return;
      }
      if (rows.length === 0) {
        rows = createAll(list);
        return;
      }
      const parent = end.parentNode!;
      const lookup = keyLookup(rows, compare as any);
      const used = new Uint8Array(rows.length);
      const oldIndex = new Int32Array(n);
      const keys = new Array<K>(n);
      const next = new Array<Row<A> | null>(n);
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
        } else {
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
      let anchor: Node = end;
      for (let i = n - 1; i >= 0; i--) {
        let row = next[i];
        if (row === null) {
          row = makeRow(keys[i], list[i], parent, anchor);
          next[i] = row;
        } else {
          row.cell.write(list[i]);
          if (stay[i] === 0) moveBefore(parent, row, anchor);
        }
        anchor = row.first;
      }
      rows = next as Row<A>[];
    };

    R.effectIn(s, () => {
      const list = items.read();
      R.untracked(() => reconcile(list));
    });
    return f;
  };

// ---------------------------------------------------------------------------
// Mounting

export const findMountPoint = (selector: string) => (): Node => {
  const target = document.querySelector(selector);
  if (target === null) throw new Error(`mount: no element matches "${selector}"`);
  return target;
};

/** Append `node` to `target`; the returned action removes what was appended. */
export const attach = (target: Node) => (node: Node) => (): (() => void) => {
  let first: Node | null = node;
  let last: Node | null = node;
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
      const after: Node | null = n.nextSibling;
      n.parentNode?.removeChild(n);
      if (n === last) break;
      n = after;
    }
  };
};
