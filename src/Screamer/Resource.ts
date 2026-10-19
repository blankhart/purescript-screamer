// Foreign module of Screamer.Resource.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Resource/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

export const keepLastImpl = <T>(isLoading: (r: T) => boolean) => (isLoaded: (r: T) => boolean) => (s: Runtime.Readable<T>) =>
  R.stateful<T>([s], () => s.read(), (_, values, prev) => (isLoading(values[0]) && isLoaded(prev) ? prev : values[0]));
