// @ts-ignore: purs copies this file to output/Screamer.Renderer/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
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
export const delegated = DELEGATED_TYPES.slice();
const DELEGATED = new Set(DELEGATED_TYPES);
/**
 * A browser backend over the global `document`, read when first used so the
 * module loads where there is none. Each backend keeps its own delegation
 * registry: the handlers it binds and the document listeners it adds.
 */
export const createBrowserBackend = () => {
    // Handlers are stored on the elements under a per-backend symbol.
    const HANDLERS = Symbol('screamer.handlers');
    const listening = new Set();
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
    function delegate(name) {
        if (listening.has(name))
            return;
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
        setAttribute: (el, name, value) => { el.setAttribute(name, value); },
        removeAttribute: (el, name) => { el.removeAttribute(name); },
        // Skip writes that would not change the property, so an input's caret
        // and partial entry survive the value it just reported being written back.
        setProperty: (el, name, value) => { if (el[name] !== value)
            el[name] = value; },
        setStyle: (el, name, value) => { el.style.setProperty(name, value); },
        setText: (node, data) => { node.data = data; },
        listen: (el, name, handler, scope) => {
            if (DELEGATED.has(name)) {
                delegate(name);
                let h = el[HANDLERS];
                if (h === undefined)
                    h = el[HANDLERS] = { scope, on: Object.create(null) };
                h.on[name] = handler;
            }
            else {
                const listener = (e) => R.batch(() => handler(e)());
                el.addEventListener(name, listener);
                scope.cleanups.push(() => el.removeEventListener(name, listener));
            }
        },
        enter: () => { },
        leave: () => { },
        select: (selector) => document.querySelector(selector),
        dispatch,
    };
};
export const browserBackend = createBrowserBackend();
export const interactiveImpl = (b) => b.interactive;
