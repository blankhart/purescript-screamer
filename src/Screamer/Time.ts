// Foreign module of Screamer.Time. Each function returns the action that
// cancels what it scheduled; cancelling twice, or after it ran, is a no-op.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Time/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

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

/** Run `action` on the next animation frame, inside a batch. */
export const frameImpl = (action: () => void) => () => {
  const id = requestAnimationFrame(() => R.batch(action));
  return () => cancelAnimationFrame(id);
};
