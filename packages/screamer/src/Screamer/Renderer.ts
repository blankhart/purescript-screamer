// Foreign module of Screamer.Renderer: the node operations Screamer.Element
// performs, behind an interface that a renderer other than the browser DOM
// can implement.
//
// `Element.ts` calls only these operations, on the backend its scope's
// context provides (`rendererKey`, default `browserBackend`). A server
// renderer supplies a backend that builds a light node tree; a hydrating
// renderer supplies one that claims existing nodes. Nodes are opaque to the
// core: a backend may use any objects, as long as its own operations accept
// them.
import type * as Runtime from '../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Renderer/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Scope = Runtime.Scope;

/** An event handler as `Screamer.Attribute.on_` stores it. */
export type Handler = (e: Event) => () => void;

export interface Backend<N = any> {
  /**
   * Whether the page responds to input: when false, `on_` attaches nothing
   * and `foreign_` runs no setup (it renders its fallback instead).
   */
  readonly interactive: boolean;
  createElement(tag: string): N;
  createElementNS(ns: string, tag: string): N;
  createText(data: string): N;
  createComment(data: string): N;
  /**
   * An empty comment that opens (`open` true) or closes a range of nodes
   * that changes over time: the anchors of `dyn`, `each`, `catchError` and
   * `suspense`. The browser backend makes an ordinary empty comment; a server
   * backend can mark it so that hydration can find the range.
   */
  createAnchor(open: boolean): N;
  createFragment(): N;
  appendChild(parent: N, child: N): void;
  insertBefore(parent: N, child: N, ref: N | null): void;
  removeChild(parent: N, child: N): void;
  parentNode(node: N): N | null;
  nextSibling(node: N): N | null;
  firstChild(node: N): N | null;
  lastChild(node: N): N | null;
  /** The DOM node type: 1 element, 3 text, 8 comment, 11 fragment. */
  nodeType(node: N): number;
  /** Remove every child of `node`. */
  clearChildren(node: N): void;
  setAttribute(el: N, name: string, value: string): void;
  removeAttribute(el: N, name: string): void;
  /** Set a DOM property, skipping a write that would not change it. */
  setProperty(el: N, name: string, value: unknown): void;
  /** Set one CSS property, by its CSS name. */
  setStyle(el: N, name: string, value: string): void;
  /** Set a text node's data. */
  setText(node: N, data: string): void;
  /**
   * Listen for `name` on `el` until `scope` is disposed. Called only when
   * `interactive` is true. The handler expects to run inside `batch`.
   */
  listen(el: N, name: string, handler: Handler, scope: Scope): void;
  /** Called after `el` is created and before its children are built. */
  enter(el: N): void;
  /** Called after `el`'s children are built (also for an element with none). */
  leave(el: N): void;
  /** The first element matching a CSS selector, for `mount` and `portal`. */
  select(selector: string): N | null;
}

/** The browser backend, with its own delegation registry. */
export interface BrowserBackend extends Backend<Node> {
  /**
   * Dispatch an event as the document listener for a delegated type does:
   * to the handlers stored on the elements from its target up to the
   * document, honouring `stopPropagation`. For replaying captured events.
   */
  dispatch(e: Event): void;
}

// Bubbling events are delegated: one listener per event type on the document
// dispatches to the handlers stored on the elements between the target and
// the document. Elements need no listener of their own, so creating and
// disposing them adds and removes none. A handler stops firing once the scope
// that bound it is disposed.
const DELEGATED_TYPES = [
  'beforeinput', 'click', 'contextmenu', 'dblclick', 'focusin', 'focusout', 'input',
  'keydown', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup',
  'pointerdown', 'pointermove', 'pointerout', 'pointerover', 'pointerup',
  'touchend', 'touchmove', 'touchstart',
];

/** The event types the browser backend delegates. */
export const delegated: string[] = DELEGATED_TYPES.slice();

const DELEGATED = new Set(DELEGATED_TYPES);

interface Bound {
  scope: Scope;
  on: Record<string, Handler>;
}

/**
 * A browser backend over the global `document`, read when first used so the
 * module loads where there is none. Each backend keeps its own delegation
 * registry: the handlers it binds and the document listeners it adds.
 */
export const createBrowserBackend = (): BrowserBackend => {
  // Handlers are stored on the elements under a per-backend symbol.
  const HANDLERS = Symbol('screamer.handlers');
  const listening = new Set<string>();

  function dispatch(e: Event): void {
    const name = e.type;
    let node = e.target as Node | null;
    Object.defineProperty(e, 'currentTarget', { configurable: true, get: () => node });
    try {
      R.batch(() => {
        while (node !== null) {
          const h = (node as any)[HANDLERS] as Bound | undefined;
          if (h !== undefined && !h.scope.disposed) {
            const handler = h.on[name];
            if (handler !== undefined) {
              handler(e)();
              if (e.cancelBubble) return;
            }
          }
          node = node.parentNode ?? ((node as ShadowRoot).host || null);
        }
      });
    } finally {
      delete (e as any).currentTarget;
    }
  }

  function delegate(name: string): void {
    if (listening.has(name)) return;
    listening.add(name);
    document.addEventListener(name, dispatch);
  }

  return {
    interactive: true,
    createElement: (tag) => document.createElement(tag),
    createElementNS: (ns, tag) => document.createElementNS(ns, tag),
    createText: (data) => document.createTextNode(data),
    createComment: (data) => document.createComment(data),
    createAnchor: () => document.createComment(''),
    createFragment: () => document.createDocumentFragment(),
    appendChild: (parent, child) => { parent.appendChild(child); },
    insertBefore: (parent, child, ref) => { parent.insertBefore(child, ref); },
    removeChild: (parent, child) => { parent.removeChild(child); },
    parentNode: (node) => node.parentNode,
    nextSibling: (node) => node.nextSibling,
    firstChild: (node) => node.firstChild,
    lastChild: (node) => node.lastChild,
    nodeType: (node) => node.nodeType,
    clearChildren: (node) => { node.textContent = ''; },
    setAttribute: (el, name, value) => { (el as Element).setAttribute(name, value); },
    removeAttribute: (el, name) => { (el as Element).removeAttribute(name); },
    // Skip writes that would not change the property, so an input's caret
    // and partial entry survive the value it just reported being written back.
    setProperty: (el, name, value) => { if ((el as any)[name] !== value) (el as any)[name] = value; },
    setStyle: (el, name, value) => { (el as HTMLElement).style.setProperty(name, value); },
    setText: (node, data) => { (node as CharacterData).data = data; },
    listen: (el, name, handler, scope) => {
      if (DELEGATED.has(name)) {
        delegate(name);
        let h = (el as any)[HANDLERS] as Bound | undefined;
        if (h === undefined) h = (el as any)[HANDLERS] = { scope, on: Object.create(null) } as Bound;
        h.on[name] = handler;
      } else {
        const listener = (e: Event) => R.batch(() => handler(e)());
        el.addEventListener(name, listener);
        scope.cleanups.push(() => el.removeEventListener(name, listener));
      }
    },
    enter: () => {},
    leave: () => {},
    select: (selector) => document.querySelector(selector),
    dispatch,
  };
};

export const browserBackend: BrowserBackend = createBrowserBackend();

export const interactiveImpl = (b: Backend): boolean => b.interactive;
