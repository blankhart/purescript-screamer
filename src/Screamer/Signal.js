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
export const combine = (ss) => R.combine(ss);
export const withLatestImpl = (pair) => (b) => (a) => R.withLatest((x, y) => pair(x)(y), b, a);
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
export const merge = (a) => (b) => R.merge(a, b);
export const latestWhere = (p) => (seed) => (s) => R.latestWhere(p, seed, s);
export const gate = (cond) => (seed) => (s) => R.gateSignal(cond, seed, s);
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
