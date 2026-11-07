// @ts-ignore: purs copies this file to output/Screamer.Motion.ViewTransition/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
/** Run the update in a batch, inside a view transition where there is one and `skip` is false. */
export const viewTransitionImpl = (skip) => (update) => () => {
    const d = typeof document === 'undefined' ? undefined : document;
    if (skip || d === undefined || typeof d.startViewTransition !== 'function') {
        R.batch(update);
        return;
    }
    d.startViewTransition(() => R.batch(update));
};
