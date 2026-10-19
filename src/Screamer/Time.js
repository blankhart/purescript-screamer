// @ts-ignore: purs copies this file to output/Screamer.Time/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';
const R = runtime;
/** Run `action` once after `ms`, inside a batch. */
export const timeoutImpl = (ms) => (action) => () => {
    const id = setTimeout(() => R.batch(action), ms);
    return () => clearTimeout(id);
};
/** Run `action` every `ms`, each time inside a batch. */
export const intervalImpl = (ms) => (action) => () => {
    const id = setInterval(() => R.batch(action), ms);
    return () => clearInterval(id);
};
/** Run `action` with the next animation frame's timestamp, inside a batch. */
export const frameImpl = (action) => () => {
    const id = requestAnimationFrame((t) => R.batch(action(t)));
    return () => cancelAnimationFrame(id);
};
