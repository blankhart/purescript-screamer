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
export const newDropRepeatsBy = (eq) => (s) => () => R.dropRepeatsBy((x, y) => eq(x)(y), s);
export const withPreviousImpl = (tuple) => (seed) => (s) => () => {
    const pair = R.stateful([s], () => ({ previous: seed, current: s.read() }), (_, values, p) => ({ previous: p.current, current: values[0] }), 'Signal.withPrevious');
    return R.map((p) => tuple(p.previous)(p.current), pair);
};
export const attemptImpl = (left) => (right) => (s) => R.derived(() => {
    try {
        return right(s.read());
    }
    catch (e) {
        return left(e instanceof Error ? e : new Error(String(e)));
    }
});
// Stateful signals. The node constructors take their arguments uncurried and
// are wrapped below for PureScript, as effects.
/**
 * The latest of `a` and `b`, starting at `a`'s current value. It updates
 * when either does, with the value of the one that did; `a` wins when both
 * update in one batch.
 */
function mergeNode(a, b) {
    return R.stateful([a, b], () => a.read(), (changed, values) => (changed[0] ? values[0] : values[1]), 'Signal.merge');
}
/** Values of `s` that satisfy `p`, starting at `seed` unless `s` satisfies `p` at the start. */
function latestWhereNode(p, seed, s) {
    return R.stateful([s], () => {
        const v = s.read();
        return p(v) ? v : seed;
    }, (_, values) => (p(values[0]) ? values[0] : R.noUpdate), 'Signal.latestWhere');
}
/**
 * Follows `s` while `cond` is true and holds its last value while `cond` is
 * false. When `cond` becomes true, it takes `s`'s current value. Starts at
 * `s` if `cond` is true at the start, otherwise at `seed`. It updates when
 * either input updates and `cond` is then true.
 */
function gateSignal(cond, seed, s) {
    return R.stateful([cond, s], () => (cond.read() ? s.read() : seed), (_, values) => (values[0] ? values[1] : R.noUpdate), 'Signal.gate');
}
export const mergeImpl = (a) => (b) => () => mergeNode(a, b);
export const latestWhereImpl = (p) => (seed) => (s) => () => latestWhereNode(p, seed, s);
export const gateImpl = (cond) => (seed) => (s) => () => gateSignal(cond, seed, s);
export const readT0 = (s) => () => R.sample(s);
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
