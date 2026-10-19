// @ts-ignore: purs copies this file to output/Screamer.Signal.Extra/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
/** The current values of all the signals, as one node. */
export function combine(ss) {
    if (ss.every((s) => R.isConstant(s)))
        return R.constant(ss.map((s) => s.value));
    return R.derived(() => {
        const out = new Array(ss.length);
        for (let i = 0; i < ss.length; i++)
            out[i] = ss[i].read();
        return out;
    });
}
/**
 * `a`'s value paired with `b`'s, changing only when `a` changes. `b` is
 * observed with it, so a stateful `b` keeps advancing.
 */
function withLatest(pair, b, a) {
    return R.stateful([a, b], () => pair(a.read(), b.read()), (changed, values, prev) => (changed[0] ? pair(values[0], values[1]) : prev));
}
export const withLatestImpl = (pair) => (b) => (a) => withLatest((x, y) => pair(x)(y), b, a);
export const history = (n) => (s) => R.stateful([s], () => (n > 0 ? [s.read()] : []), (_, values, xs) => {
    const next = xs.concat([values[0]]);
    return next.length > n ? next.slice(next.length - n) : next;
});
