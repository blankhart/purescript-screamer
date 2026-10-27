// Foreign module of Screamer.Motion.Animate: the Web Animations API.
//
// Each function starts an animation and returns the action that cancels
// it. Where `Element.animate` is missing (jsdom), nothing animates and the
// animation counts as finished at once.
import type * as Runtime from '../../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Motion.Animate/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Eff<A> = () => A;

const ELEMENT = 1;
const noop = () => {};

interface Options {
  duration: number;
  easing: string;
  fill: FillMode;
}

/**
 * Animate `node` and call `finished` (inside `batch`) when the animation
 * finishes, but not when it is cancelled.
 */
export const animateImpl = (keyframes: Keyframe[]) => (opts: Options) => (node: Node) => (finished: Eff<void>) => (): Eff<void> => {
  const el = node as any;
  if (node.nodeType !== ELEMENT || typeof el.animate !== 'function') {
    finished();
    return noop;
  }
  const a: Animation = el.animate(keyframes, { duration: opts.duration, easing: opts.easing, fill: opts.fill });
  let live = true;
  a.finished.then(
    () => {
      if (live) R.batch(finished);
    },
    () => {},
  );
  return () => {
    live = false;
    a.cancel();
  };
};

export const isElement = (node: Node): boolean => node.nodeType === ELEMENT;

export const measure = (node: Node) => () => {
  const r = (node as Element).getBoundingClientRect();
  return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height, x: r.x, y: r.y };
};

/** Hide the node with an inline `opacity: 0`; the action restores what was there. */
export const hide = (node: Node) => (): Eff<void> => {
  if (node.nodeType !== ELEMENT) return noop;
  const style = (node as HTMLElement).style;
  const was = style.getPropertyValue('opacity');
  const priority = style.getPropertyPriority('opacity');
  style.setProperty('opacity', '0');
  return () => {
    if (was === '') style.removeProperty('opacity');
    else style.setProperty('opacity', was, priority);
  };
};

/** Which key each node was marked with: a fragment marks its children. */
export const newTags = () => new WeakMap<Node, unknown>();

export const tag = (tags: WeakMap<Node, unknown>) => (node: Node) => (key: unknown) => () => {
  if (node.nodeType !== 11) {
    tags.set(node, key);
    return;
  }
  for (let n = node.firstChild; n !== null; n = n.nextSibling) tags.set(n, key);
};

export const tagOfImpl = <A>(just: (a: A) => unknown) => (nothing: unknown) => (tags: WeakMap<Node, A>) => (node: Node) => () =>
  tags.has(node) ? just(tags.get(node) as A) : nothing;
