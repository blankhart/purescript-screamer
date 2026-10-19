// @ts-ignore: purs copies this file to output/Screamer.Source/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
export const signalSource = (a) => () => {
    const c = R.cell(a);
    return {
        signal: c,
        put: (x) => () => c.write(x),
        modify: (f) => () => c.write(f(c.value)),
    };
};
export const eventSource = () => {
    const src = R.eventSource();
    return {
        event: src,
        fire: (x) => () => src.fire(x),
    };
};
export const batch = (e) => () => R.batch(e);
