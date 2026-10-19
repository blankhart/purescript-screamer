// @ts-ignore: purs copies this file to output/Screamer.Event/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';
const R = runtime;
const NONE = [];
export const mapImpl = (f) => (e) => R.mapEvent(f, e);
export const altImpl = (a) => (b) => R.alt(a, b);
export const emptyImpl = R.neverEvent;
export const filterImpl = (p) => (e) => R.filterEvent(p, e);
export const filterMapImpl = (f) => (e) => R.filterMapEvent(f, e);
export const changes = (s) => R.changes(s);
export const stepper = (seed) => (e) => R.stepper(seed, e);
export const fold = (f) => (seed) => (e) => R.foldEvent((a, b) => f(a)(b), seed, e);
export const attachWith = (f) => (s) => (e) => R.attachWith((b, a) => f(b)(a), s, e);
export const holdImpl = (s) => (e) => () => R.runInScope(s, () => R.holdEvent(e));
export const subscribeImpl = (s) => (e) => (cb) => () => {
    R.subscribeEvent(s, e, (a) => cb(a)());
};
const accum = (f, seed) => (e) => R.accumEvent(f, seed, e);
export const gate = (cond) => (e) => gateNode(cond, e);
export const mapAccum = (f) => (seed) => accum((a, s) => {
    const r = f(a)(s);
    return { state: r.state, emit: true, value: r.value };
}, () => seed);
const noPrev = () => ({ has: false, v: undefined });
export const withPrevious = (e) => accum((a, p) => (p.has
    ? { state: { has: true, v: a }, emit: true, value: { previous: p.v, current: a } }
    : { state: { has: true, v: a }, emit: false }), noPrev)(e);
export const dropRepeatsByImpl = (eq) => (e) => accum((a, p) => ({ state: { has: true, v: a }, emit: !p.has || !eq(p.v)(a), value: a }), noPrev)(e);
// Combining several streams (#20). Node constructors with more than one
// argument take them uncurried and are wrapped below for PureScript.
/** All the inputs' occurrences in stamp order; on equal stamps, earlier inputs first. */
export function oneOf(es) {
    const ins = es.filter((e) => e !== R.neverEvent);
    if (ins.length === 0)
        return R.neverEvent;
    if (ins.length === 1)
        return ins[0];
    return R.eventDerived((r) => {
        let out = NONE;
        let lists = 0;
        for (let i = 0; i < ins.length; i++) {
            const os = r.occ(ins[i]);
            if (os.length === 0)
                continue;
            out = lists === 0 ? os : out.concat(os);
            lists++;
        }
        // A stable sort keeps earlier inputs first on equal stamps.
        return lists > 1 ? out.slice().sort((x, y) => x.s - y.s) : out;
    });
}
// Flattening (#21).
export const switchEvent = (s) => R.switchEvent(s);
/** The occurrences of every event in the signal's array, in fire order. */
export function mergeAll(s) {
    return R.eventDerived((r) => {
        const es = s.read();
        let out = NONE;
        let lists = 0;
        for (let i = 0; i < es.length; i++) {
            const os = r.occ(es[i]);
            if (os.length === 0)
                continue;
            out = lists === 0 ? os : out.concat(os);
            lists++;
        }
        return lists > 1 ? out.slice().sort((x, y) => x.s - y.s) : out;
    });
}
/** The occurrences of `e` in rounds that end with `cond` true. */
function gateNode(cond, e) {
    return R.eventDerived((r) => {
        const open = cond.read();
        const os = r.occ(e);
        return open ? os : NONE;
    });
}
