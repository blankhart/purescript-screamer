// @ts-ignore: purs copies this file to output/Screamer.Channel/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';
const R = CoreRuntime;
export const channel = (a) => () => {
    const c = R.cell(a);
    return {
        signal: c,
        put: (x) => () => c.write(x),
        modify: (f) => () => c.write(f(c.value)),
    };
};
export const batch = (e) => () => R.batch(e);
