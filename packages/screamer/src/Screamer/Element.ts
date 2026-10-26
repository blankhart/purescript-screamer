// Foreign module of Screamer.Element: the DOM layer.
//
// An Element is an `Owned Node`; at run time that is a function from a scope
// to an effect producing the node. Instantiating it creates the DOM nodes and
// the effects that keep them up to date, all owned by that scope.
//
// Every node operation goes through a renderer backend (`Renderer.ts`). The
// backend in use while an element is built is `B`: `instantiate` sets it from
// the scope's context, and each range that builds later (`dyn`, `each`)
// captures it, so building costs one context lookup per instantiation rather
// than one per node.
import type { Attr } from './Attribute.js';
import type * as Renderer from './Renderer.js';
import type * as Runtime from '../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Element/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
// @ts-ignore: likewise output/Screamer.Renderer/foreign.js.
import * as renderer from '../Screamer.Renderer/foreign.js';

const R: typeof Runtime = runtime;
const Rn: typeof Renderer = renderer;

type Backend = Renderer.Backend;

type Scope = Runtime.Scope;
type Sig<T> = Runtime.Readable<T>;
type N = any;
type El = (s: Scope) => () => N;

const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAGMENT = 11;

let B: Backend = Rn.browserBackend;

/** Run `f` with `b` as the backend that new nodes are built with. */
function withB<T>(b: Backend, f: () => T): T {
  const prev = B;
  B = b;
  try {
    return f();
  } finally {
    B = prev;
  }
}

export const withBackend = (b: Backend) => <A>(e: () => A) => (): A => withB(b, e);

// ---------------------------------------------------------------------------
// Attributes, as `Screamer.Attribute` builds them. The kinds must match
// Attribute.ts.

const PROPERTY = 0;
const ATTRIBUTE = 1;
const BOOLEAN = 2;
const STYLE = 3;
const EVENT = 4;
const GROUP = 5;

type Handler = (e: Event) => () => void;

const UNSET: any = {};

/**
 * Set once for a constant, or with one owned effect for a signal. A signal
 * updates whenever its arguments do (#68), so the effect skips a write of
 * the value it wrote last: the DOM is at the edge of the graph, and nothing
 * in it can observe the skip.
 */
function bindValue<T>(s: Scope, sig: Sig<T>, set: (v: T) => void): void {
  if (R.isConstant(sig)) {
    set(sig.value);
    return;
  }
  let last: T = UNSET;
  R.effectIn(s, () => {
    const v = sig.read();
    if (Object.is(v, last)) return;
    last = v;
    set(v);
  });
}

function bindAttr(b: Backend, s: Scope, el: N, a: Attr): void {
  const name = a.name;
  switch (a.kind) {
    case PROPERTY:
      bindValue(s, a.value, (v) => { b.setProperty(el, name, v); });
      break;
    case ATTRIBUTE:
      bindValue(s, a.value, (v: string) => { b.setAttribute(el, name, v); });
      break;
    case BOOLEAN:
      bindValue(s, a.value, (v: boolean) => {
        if (v) b.setAttribute(el, name, '');
        else b.removeAttribute(el, name);
      });
      break;
    case STYLE:
      bindValue(s, a.value, (v: string) => { b.setStyle(el, name, v); });
      break;
    case EVENT:
      if (b.interactive) b.listen(el, name, a.value as Handler, s);
      break;
    case GROUP: {
      const list = a.value as Attr[];
      for (let i = 0; i < list.length; i++) bindAttr(b, s, el, list[i]);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Elements

function build(b: Backend, el: N, attrs: Attr[], children: El[], s: Scope): N {
  b.enter(el);
  for (let i = 0; i < children.length; i++) b.appendChild(el, children[i](s)());
  b.leave(el);
  for (let i = 0; i < attrs.length; i++) bindAttr(b, s, el, attrs[i]);
  return el;
}

export const elementImpl = (tag: string) => (attrs: Attr[]) => (children: El[]) => (s: Scope) => (): N =>
  build(B, B.createElement(tag), attrs, children, s);

export const svgElementImpl = (tag: string) => (attrs: Attr[]) => (children: El[]) => (s: Scope) => (): N =>
  build(B, B.createElementNS(SVG_NS, tag), attrs, children, s);

/**
 * The host element of `foreign_`: its attributes, and no children. Any it
 * already has (a hydrating backend claims the server's fallback) are
 * cleared before the widget's setup runs.
 */
export const foreignHostImpl = (tag: string) => (attrs: Attr[]) => (s: Scope) => (): N => {
  const b = B;
  const el = b.createElement(tag);
  b.enter(el);
  if (b.firstChild(el) !== null) b.clearChildren(el);
  b.leave(el);
  for (let i = 0; i < attrs.length; i++) bindAttr(b, s, el, attrs[i]);
  return el;
};

export const fragmentImpl = (children: El[]) => (s: Scope) => (): N => {
  const b = B;
  const f = b.createFragment();
  for (let i = 0; i < children.length; i++) b.appendChild(f, children[i](s)());
  return f;
};

export const textImpl = (sig: Sig<string>) => (s: Scope) => (): N => {
  const b = B;
  if (R.isConstant(sig)) return b.createText(sig.value);
  const node = b.createText('');
  let last: string = UNSET;
  R.effectIn(s, () => {
    const v = sig.read();
    if (v === last) return;
    last = v;
    b.setText(node, v);
  });
  return node;
};

/** Instantiate `el` with backend `b` in a fresh child scope of `parent`, untracked. */
function instantiateIn(b: Backend, parent: Scope, el: El): { scope: Scope; node: N } {
  const scope = R.createScope(parent);
  const node = withB(b, () => R.untracked(() => R.runInScope(scope, () => el(scope)())));
  return { scope, node };
}

function removeBetween(b: Backend, start: N, end: N, r: Remover | null = null): void {
  const parent = b.parentNode(end)!;
  let n = b.nextSibling(start);
  while (n !== null && n !== end) {
    const next = b.nextSibling(n);
    if (r === null) b.removeChild(parent, n);
    else r.remove(parent, n);
    n = next;
  }
}

// ---------------------------------------------------------------------------
// Leave hooks

/** A context key, as `Screamer.Context.key` makes it. */
interface Key<A> {
  name: string;
  default: A;
}

type LeaveHook = (node: N) => (done: () => void) => () => void;

/** The default leave hook: detach at once. `dyn` and `each` skip the hook when it is this one. */
export const immediateLeave: LeaveHook = () => (done) => () => done();

/**
 * Detaches the nodes of removed branches or rows. With a leave hook, each
 * top-level node stays in place until the hook calls its `done`, or until
 * the owning scope is disposed, whichever comes first.
 */
class Remover {
  private leaving: Set<N> = new Set();
  constructor(private b: Backend, private hook: LeaveHook | null) {}

  static of(b: Backend, s: Scope, k: Key<LeaveHook>): Remover {
    const hook = R.lookupContext(s, k.name, k.default);
    const r = new Remover(b, hook === immediateLeave ? null : hook);
    if (r.hook !== null) s.cleanups.push(() => r.flush());
    return r;
  }

  get delayed(): boolean {
    return this.hook !== null;
  }

  isLeaving(n: N): boolean {
    return this.hook !== null && this.leaving.has(n);
  }

  remove(parent: N, n: N): void {
    if (this.hook === null) {
      this.b.removeChild(parent, n);
      return;
    }
    if (this.leaving.has(n)) return;
    this.leaving.add(n);
    this.hook(n)(() => this.finish(n))();
  }

  private finish(n: N): void {
    if (!this.leaving.delete(n)) return;
    const p = this.b.parentNode(n);
    if (p !== null) this.b.removeChild(p, n);
  }

  /** Detach every node still leaving. */
  flush(): void {
    for (const n of Array.from(this.leaving)) this.finish(n);
  }
}

/** A fragment holding a pair of anchors, for a range that changes. */
function anchors(b: Backend): { start: N; end: N; f: N } {
  const start = b.createAnchor(true);
  const end = b.createAnchor(false);
  const f = b.createFragment();
  b.appendChild(f, start);
  b.appendChild(f, end);
  return { start, end, f };
}

export const dynImpl = (leave: Key<LeaveHook>) => (sig: Sig<El>) => (s: Scope) => (): N => {
  if (R.isConstant(sig)) return sig.value(s)();
  const b = B;
  const { start, end, f } = anchors(b);
  const remover = Remover.of(b, s, leave);
  let child: Scope | null = null;
  R.effectIn(s, () => {
    const el = sig.read();
    R.untracked(() => {
      if (child !== null) child.dispose();
      child = null;
      removeBetween(b, start, end, remover);
      const made = instantiateIn(b, s, el);
      child = made.scope;
      b.insertBefore(b.parentNode(end)!, made.node, end);
    });
  });
  return f;
};

// ---------------------------------------------------------------------------
// Keyed lists

interface Row<A> {
  key: any;
  cell: Runtime.Cell<A>;
  scope: Scope;
  first: N;
  last: N;
}

/** Indices of a longest strictly increasing subsequence of `xs`, ignoring negative entries. */
function longestIncreasingSubsequence(xs: ArrayLike<number>): Uint8Array {
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

function moveBefore(b: Backend, parent: N, row: Row<any>, next: N): void {
  if (b.nextSibling(row.last) === next) return;
  if (row.first === row.last) {
    b.insertBefore(parent, row.first, next);
    return;
  }
  let n: N = row.first;
  for (;;) {
    const after = b.nextSibling(n);
    b.insertBefore(parent, n, next);
    if (n === row.last) break;
    n = after;
  }
}

function removeRow(b: Backend, parent: N, row: Row<any>, r: Remover): void {
  let n: N = row.first;
  for (;;) {
    const after = b.nextSibling(n);
    r.remove(parent, n);
    if (n === row.last || after === null) break;
    n = after;
  }
}

export const eachImpl =
  (leave: Key<LeaveHook>) =>
  <A, K>(compare: (a: K) => (b: K) => number) =>
  (keyOf: (a: A) => K) =>
  (items: Sig<A[]>) =>
  (render: (s: Sig<A>) => El) =>
  (s: Scope) =>
  (): N => {
    const b = B;
    const { start, end, f } = anchors(b);
    const remover = Remover.of(b, s, leave);
    let rows: Row<A>[] = [];

    const makeRow = (key: K, item: A, into: N, before: N | null): Row<A> => {
      const cell = R.cell(item);
      const { scope, node } = instantiateIn(b, s, render(cell));
      let first: N;
      let last: N;
      if (b.nodeType(node) === FRAGMENT) {
        if (b.firstChild(node) === null) b.appendChild(node, b.createComment(''));
        first = b.firstChild(node);
        last = b.lastChild(node);
      } else {
        first = node;
        last = node;
      }
      b.insertBefore(into, node, before);
      return { key, cell, scope, first, last };
    };

    const createAll = (list: A[]): Row<A>[] => {
      const frag = b.createFragment();
      const made = new Array<Row<A>>(list.length);
      for (let i = 0; i < list.length; i++) made[i] = makeRow(keyOf(list[i]), list[i], frag, null);
      b.insertBefore(b.parentNode(end)!, frag, end);
      return made;
    };

    const clearAll = () => {
      for (let i = rows.length - 1; i >= 0; i--) rows[i].scope.dispose();
      const parent = b.parentNode(end)!;
      if (remover.delayed) {
        for (let i = 0; i < rows.length; i++) removeRow(b, parent, rows[i], remover);
      } else if (b.firstChild(parent) === start && b.lastChild(parent) === end && b.nodeType(parent) !== FRAGMENT) {
        // The list owns its parent: replace the children wholesale.
        b.clearChildren(parent);
        b.appendChild(parent, start);
        b.appendChild(parent, end);
      } else {
        removeBetween(b, start, end);
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
      const parent = b.parentNode(end)!;
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
        if (tailOld > head) rows.splice(head, tailOld - head);
        return;
      }
      if (head === tailOld) {
        // Only insertions in the middle.
        const anchor = tailOld < m ? rows[tailOld].first : end;
        const frag = b.createFragment();
        const made = new Array<Row<A>>(tailNew - head);
        for (let i = head; i < tailNew; i++) made[i - head] = makeRow(keyOf(list[i]), list[i], frag, null);
        b.insertBefore(parent, frag, anchor);
        rows = rows.slice(0, head).concat(made, rows.slice(head));
        return;
      }
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
          removeRow(b, parent, rows[j], remover);
        }
      }
      const stay = longestIncreasingSubsequence(oldIndex);
      let anchor: N = end;
      for (let i = n - 1; i >= 0; i--) {
        let row = next[i];
        if (row === null) {
          row = makeRow(keys[i], list[i], parent, anchor);
          next[i] = row;
        } else {
          row.cell.putT1(list[i]);
          if (stay[i] === 0) moveBefore(b, parent, row, anchor);
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
// Portals, error boundaries and suspense

export const portalImpl = (selector: string) => (el: El) => (s: Scope) => (): N => {
  const b = B;
  const target = b.select(selector);
  if (target === null) throw new Error(`portal: no element matches "${selector}"`);
  const { scope, node } = instantiateIn(b, s, el);
  scope.cleanups.push(attachRange(b, target, node));
  return b.createComment('');
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const catchErrorImpl = (handler: (e: Error) => El) => (el: El) => (s: Scope) => (): N => {
  const b = B;
  const { start, end, f } = anchors(b);
  const scope = R.createScope(s);
  let failed = false;
  // Replace the child with the handler's element. Errors from the handler's
  // element are not caught here: its scope is a sibling of the child's.
  const recover = (e: unknown): void => {
    failed = true;
    scope.onError = null;
    scope.dispose();
    removeBetween(b, start, end);
    const made = instantiateIn(b, s, handler(toError(e)));
    b.insertBefore(b.parentNode(end)!, made.node, end);
  };
  scope.onError = recover;
  let node: N = null;
  try {
    node = withB(b, () => R.untracked(() => R.runInScope(scope, () => el(scope)())));
  } catch (e) {
    // Once an effect has failed and been recovered from, the rest of the
    // build fails on the disposed scope; that is not a new error.
    if (!failed) recover(e);
  }
  if (!failed) b.insertBefore(f, node, end);
  return f;
};

type Boundary = { start: N; end: N; settled: Sig<boolean> };

export const suspenseImpl =
  (settledIn: (s: Scope) => () => Sig<boolean>) =>
  (boundary: Key<(b: Boundary) => () => void>) =>
  (fallback: El) =>
  (content: El) =>
  (s: Scope) =>
  (): N => {
    const b = B;
    const { start, end, f } = anchors(b);
    const scope = R.createScope(s);
    const settled = settledIn(scope)();
    R.lookupContext(s, boundary.name, boundary.default)({ start, end, settled })();
    // The content builds detached, so its pending work starts at once.
    const node = withB(b, () => R.untracked(() => R.runInScope(scope, () => content(scope)())));
    if (R.sample(settled)) {
      b.insertBefore(f, node, end);
      return f;
    }
    const shown = instantiateIn(b, s, fallback);
    b.insertBefore(f, shown.node, end);
    const watch = R.createScope(s);
    R.effectIn(watch, () => {
      if (!settled.read()) return;
      R.untracked(() => {
        watch.dispose();
        shown.scope.dispose();
        removeBetween(b, start, end);
        b.insertBefore(b.parentNode(end)!, node, end);
      });
    });
    return f;
  };

// ---------------------------------------------------------------------------
// Mounting

export const findMountPoint = (b: Backend) => (selector: string) => (): N => {
  const target = b.select(selector);
  if (target === null) throw new Error(`mount: no element matches "${selector}"`);
  return target;
};

/** Append `node` to `target`; the returned action removes what was appended. */
function attachRange(b: Backend, target: N, node: N): () => void {
  let first: N = node;
  let last: N = node;
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
      if (parent !== null) b.removeChild(parent, n);
      if (n === last) break;
      n = after;
    }
  };
}

export const attach = (b: Backend) => (target: N) => (node: N) => (): (() => void) => attachRange(b, target, node);
