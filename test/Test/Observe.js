import * as R from '../Screamer.Reactive.Core/foreign.js';

export const observe = (s) => () => {
  const trace = [];
  const stop = R.scope(() => {
    R.effect(() => { trace.push(s.read()); });
  }, null);
  return { trace: () => trace.slice(), stop };
};
