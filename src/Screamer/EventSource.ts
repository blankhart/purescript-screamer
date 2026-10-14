// Foreign module of Screamer.EventSource.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.EventSource/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

export const eventSource = <A>() => {
  const src = R.eventSource<A>();
  return {
    event: src,
    fire: (x: A) => () => src.fire(x),
  };
};
