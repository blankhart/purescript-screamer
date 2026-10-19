// Foreign module of Screamer.Time. Each function returns the action that
// cancels what it scheduled; cancelling twice, or after it ran, is a no-op.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Time/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

/** Run `action` once after `ms`, inside a batch. */
export const timeoutImpl = (ms: number) => (action: () => void) => () => {
  const id = setTimeout(() => R.batch(action), ms);
  return () => clearTimeout(id);
};

/** Run `action` every `ms`, each time inside a batch. */
export const intervalImpl = (ms: number) => (action: () => void) => () => {
  const id = setInterval(() => R.batch(action), ms);
  return () => clearInterval(id);
};

/** Run `action` with the next animation frame's timestamp, inside a batch. */
export const frameImpl = (action: (t: number) => () => void) => () => {
  const id = requestAnimationFrame((t) => R.batch(action(t)));
  return () => cancelAnimationFrame(id);
};
