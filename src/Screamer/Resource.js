// @ts-ignore: purs copies this file to output/Screamer.Resource/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
export const keepLastImpl = (isLoading) => (isLoaded) => (s) => R.stateful([s], () => s.read(), (_, values, prev) => (isLoading(values[0]) && isLoaded(prev) ? prev : values[0]));
