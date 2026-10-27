// Foreign module of Screamer.Motion.ViewTransition.
import type * as Runtime from '../../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Motion.ViewTransition/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Eff<A> = () => A;

/** Run the update in a batch, inside a view transition where there is one and `skip` is false. */
export const viewTransitionImpl = (skip: boolean) => (update: Eff<void>) => (): void => {
  const d: any = typeof document === 'undefined' ? undefined : document;
  if (skip || d === undefined || typeof d.startViewTransition !== 'function') {
    R.batch(update);
    return;
  }
  d.startViewTransition(() => R.batch(update));
};
