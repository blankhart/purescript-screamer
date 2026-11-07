// @ts-ignore: purs copies this file to output/Screamer.Motion.Animate/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const ELEMENT = 1;
const noop = () => { };
/**
 * Animate `node` and call `finished` (inside `batch`) when the animation
 * finishes, but not when it is cancelled.
 */
export const animateImpl = (keyframes) => (opts) => (node) => (finished) => () => {
    const el = node;
    if (node.nodeType !== ELEMENT || typeof el.animate !== 'function') {
        finished();
        return noop;
    }
    const a = el.animate(keyframes, { duration: opts.duration, easing: opts.easing, fill: opts.fill });
    let live = true;
    a.finished.then(() => {
        if (live)
            R.batch(finished);
    }, () => { });
    return () => {
        live = false;
        a.cancel();
    };
};
export const isElement = (node) => node.nodeType === ELEMENT;
export const measure = (node) => () => {
    const r = node.getBoundingClientRect();
    return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height, x: r.x, y: r.y };
};
/** Hide the node with an inline `opacity: 0`; the action restores what was there. */
export const hide = (node) => () => {
    if (node.nodeType !== ELEMENT)
        return noop;
    const style = node.style;
    const was = style.getPropertyValue('opacity');
    const priority = style.getPropertyPriority('opacity');
    style.setProperty('opacity', '0');
    return () => {
        if (was === '')
            style.removeProperty('opacity');
        else
            style.setProperty('opacity', was, priority);
    };
};
/** Which key each node was marked with: a fragment marks its children. */
export const newTags = () => new WeakMap();
export const tag = (tags) => (node) => (key) => () => {
    if (node.nodeType !== 11) {
        tags.set(node, key);
        return;
    }
    for (let n = node.firstChild; n !== null; n = n.nextSibling)
        tags.set(n, key);
};
export const tagOfImpl = (just) => (nothing) => (tags) => (node) => () => tags.has(node) ? just(tags.get(node)) : nothing;
