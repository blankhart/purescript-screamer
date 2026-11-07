// @ts-ignore: purs copies this file to output/Screamer.Context/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
export const provideImpl = (s) => (k) => (value) => (body) => () => {
    if (s.disposed)
        throw new Error(`provide ${k.name} in a disposed scope`);
    const c = R.createScope(s);
    R.tagScope(c, 'provide');
    const ctx = Object.create(R.contextOf(s));
    ctx[k.name] = value;
    c.ctx = ctx;
    return R.batch(() => R.runInScope(c, () => body(c)()));
};
export const askImpl = (s) => (k) => () => R.lookupContext(s, k.name, k.default);
// The id counter lives on the root scope's own context object. It is read
// from the root directly, never by lookup, so contexts provided before it
// was created need not see it.
const counter = Symbol('uniqueId');
export const uniqueIdImpl = (s) => () => {
    let root = s;
    while (root.parent !== null)
        root = root.parent;
    if (root.ctx === null)
        root.ctx = Object.create(null);
    const n = Object.prototype.hasOwnProperty.call(root.ctx, counter) ? root.ctx[counter] : 0;
    root.ctx[counter] = n + 1;
    return `s${n}`;
};
