// @ts-ignore: purs copies this file to output/Screamer.Signal/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';
const R = runtime;
export const mapImpl = (f) => (s) => R.map(f, s);
export const applyImpl = (sf) => (sa) => R.apply(sf, sa);
export const pureImpl = (a) => R.constant(a);
export const bindImpl = (s) => (f) => s instanceof R.Constant ? f(s.value) : R.bind(s, f);
export const sampleOn = (a) => (b) => R.derived(() => {
    a.read();
    return R.sample(b);
});
export const dropRepeatsByImpl = (eq) => (s) => R.dropRepeatsBy((x, y) => eq(x)(y), s);
export const withPreviousImpl = (tuple) => (seed) => (s) => {
    const pair = R.stateful([s], () => ({ previous: seed, current: s.read() }), (_, values, p) => ({ previous: p.current, current: values[0] }));
    return R.map((p) => tuple(p.previous)(p.current), pair);
};
/** The current values of all the signals, as one node. */
export function combine(ss) {
    if (ss.every((s) => s instanceof R.Constant))
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
export const attemptImpl = (left) => (right) => (s) => R.derived(() => {
    try {
        return right(s.read());
    }
    catch (e) {
        return left(e instanceof Error ? e : new Error(String(e)));
    }
});
// Stateful signals. The node constructors take their arguments uncurried and
// are wrapped below for PureScript.
/**
 * The latest of `a` and `b`, starting at `a`'s current value; `a` wins when
 * both change in one batch. A merge reports every step, even one that repeats
 * its value, so nested merges agree on which input changed and `<|>` stays
 * associative.
 */
function mergeNode(a, b) {
    return R.stateful([a, b], () => a.read(), (changed, values) => (changed[0] ? values[0] : values[1]), never);
}
const never = () => false;
/** Values of `s` that satisfy `p`, starting at `seed` unless `s` satisfies `p` at the start. */
function latestWhereNode(p, seed, s) {
    return R.stateful([s], () => {
        const v = s.read();
        return p(v) ? v : seed;
    }, (_, values, prev) => (p(values[0]) ? values[0] : prev));
}
/**
 * Follows `s` while `cond` is true and holds its last value while `cond` is
 * false. When `cond` becomes true, it takes `s`'s current value. Starts at
 * `s` if `cond` is true at the start, otherwise at `seed`.
 */
function gateSignal(cond, seed, s) {
    return R.stateful([cond, s], () => (cond.read() ? s.read() : seed), (_, values, prev) => (values[0] ? values[1] : prev));
}
export const merge = (a) => (b) => mergeNode(a, b);
export const latestWhere = (p) => (seed) => (s) => latestWhereNode(p, seed, s);
export const gate = (cond) => (seed) => (s) => gateSignal(cond, seed, s);
export const read = (s) => () => R.sample(s);
export const subscribeImpl = (s) => (sig) => (cb) => () => {
    R.runInScope(s, () => {
        R.effect(() => {
            const v = sig.read();
            R.untracked(() => cb(v)());
        });
    });
};
export const holdImpl = (s) => (sig) => () => R.runInScope(s, () => R.hold(sig));
export const sampleManyWithImpl = (sampled) => (tracked) => (f) => {
    const sampledKeys = Object.keys(sampled);
    const trackedKeys = Object.keys(tracked);
    return R.derived(() => {
        const obj = {};
        for (const k of sampledKeys)
            obj[k] = R.sample(sampled[k]);
        for (const k of trackedKeys)
            obj[k] = tracked[k].read();
        return f(obj);
    });
};
