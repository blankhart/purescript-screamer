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
/** Turn strict mode on: development warnings are thrown as errors. */
export const strict = () => {
    R.setStrict(true);
};
export const withoutStrict = (action) => () => {
    const was = R.isStrict();
    R.setStrict(false);
    try {
        return action();
    }
    finally {
        R.setStrict(was);
    }
};
