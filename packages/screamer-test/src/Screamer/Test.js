// @ts-ignore: purs copies this file to output/Screamer.Test/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
export const observe = (s) => () => {
    const trace = [];
    const stop = R.scope(() => {
        R.effect(() => { trace.push(s.read()); });
    }, null);
    return { trace: () => trace.slice(), stop };
};
export const exit = (code) => () => {
    globalThis.process.exitCode = code;
};
