// Foreign module of Screamer.Resource.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Resource/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

export const keepLastImpl = <T>(isLoading: (r: T) => boolean) => (isLoaded: (r: T) => boolean) => (s: Core.Readable<T>) =>
  R.stateful<T>([s], () => s.read(), (_, values, prev) => (isLoading(values[0]) && isLoaded(prev) ? prev : values[0]));
