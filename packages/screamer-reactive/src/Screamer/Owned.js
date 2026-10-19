// @ts-ignore: purs copies this file to output/Screamer.Owned/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
/** Run an `Owned` body (a function of the scope) in `s`, inside a batch. */
const runIn = (s, body) => R.batch(() => R.runInScope(s, () => body(s)()));
export const onCleanupImpl = (s) => (e) => () => {
    if (s.disposed)
        throw new Error('onCleanup in a disposed scope');
    s.cleanups.push(e);
};
const result = (value, s) => ({ value, dispose: () => R.batch(() => s.dispose()) });
export const childImpl = (s) => (body) => () => {
    const c = R.createScope(s);
    return result(runIn(c, body), c);
};
export const runOwnedImpl = (body) => () => {
    const s = R.createScope(null);
    s.onError = (e) => {
        console.error(e);
        throw e;
    };
    let value;
    try {
        value = runIn(s, body);
    }
    catch (e) {
        s.dispose();
        throw e;
    }
    return result(value, s);
};
export const onErrorImpl = (s) => (handler) => () => {
    s.onError = (e) => handler(e instanceof Error ? e : new Error(String(e)))();
};
