// @ts-ignore: purs copies this file to output/Screamer.Resource/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';
const R = CoreRuntime;
export const keepLastImpl = (isLoading) => (isLoaded) => (s) => R.stateful([s], () => s.read(), (_, values, prev) => (isLoading(values[0]) && isLoaded(prev) ? prev : values[0]));
