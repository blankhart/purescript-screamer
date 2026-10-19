// @ts-ignore: purs copies this file to output/Screamer.Event/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';
const R = runtime;
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
export const gate = (cond) => (e) => R.gate(cond, e);
export const mapAccum = (f) => (seed) => accum((a, s) => {
    const r = f(a)(s);
    return { state: r.state, emit: true, value: r.value };
}, () => seed);
const noPrev = () => ({ has: false, v: undefined });
export const withPrevious = (e) => accum((a, p) => (p.has
    ? { state: { has: true, v: a }, emit: true, value: { previous: p.v, current: a } }
    : { state: { has: true, v: a }, emit: false }), noPrev)(e);
export const dropRepeatsByImpl = (eq) => (e) => accum((a, p) => ({ state: { has: true, v: a }, emit: !p.has || !eq(p.v)(a), value: a }), noPrev)(e);
export const take = (n) => (e) => accum((a, k) => (k < n ? { state: k + 1, emit: true, value: a } : { state: k, emit: false }), () => 0)(e);
export const skip = (n) => (e) => accum((a, k) => (k < n ? { state: k + 1, emit: false } : { state: k, emit: true, value: a }), () => 0)(e);
export const takeWhile = (p) => (e) => accum((a, done) => (!done && p(a) ? { state: false, emit: true, value: a } : { state: true, emit: false }), () => false)(e);
export const skipWhile = (p) => (e) => accum((a, open) => (open || !p(a) ? { state: true, emit: true, value: a } : { state: false, emit: false }), () => false)(e);
// Combining several streams (#20).
export const oneOf = (es) => R.oneOf(es);
export const leftmost = (es) => R.leftmost(es);
export const mergeWith = (both) => (left) => (right) => (ea) => (eb) => R.mergeWith((a, b) => both(a)(b), left, right, ea, eb);
export const zipWith = (f) => (ea) => (eb) => R.zip((a, b) => f(a)(b), ea, eb);
export const race = (es) => R.race(es);
// Flattening (#21).
export const switchEvent = (s) => R.switchEvent(s);
// Buffering (#23). A paused buffer keeps what it holds, like any stateful node.
export const bufferCount = (n) => (step) => (e) => {
    const size = Math.max(1, n);
    const every = Math.max(1, step);
    return accum((a, st) => {
        const open = st.seen % every === 0 ? st.open.concat([[]]) : st.open.slice();
        let full = null;
        for (let i = 0; i < open.length; i++) {
            open[i] = open[i].concat([a]);
            if (open[i].length === size && full === null)
                full = open[i];
        }
        const rest = full === null ? open : open.filter((b) => b !== full);
        return { state: { seen: st.seen + 1, open: rest }, emit: full !== null, value: full ?? undefined };
    }, () => ({ seen: 0, open: [] }))(e);
};
export const bufferOn = (notifier) => (e) => R.eventStateful([e, notifier], () => [], (changed, values, held) => {
    const as = changed[0] ? values[0] : [];
    const ns = changed[1] ? values[1] : [];
    const out = [];
    let buf = held;
    let i = 0;
    for (let j = 0; j < ns.length; j++) {
        // Occurrences fired up to the notifier's (inclusive) go in its buffer.
        const take = [];
        while (i < as.length && as[i].s <= ns[j].s)
            take.push(as[i++].v);
        out.push({ s: ns[j].s, v: buf.concat(take) });
        buf = [];
    }
    while (i < as.length)
        buf = buf.concat([as[i++].v]);
    return { state: buf, out };
});
export const bufferWhile = (cond) => (e) => R.eventStateful([cond, e], () => ({ open: cond.read(), buf: [] }), (changed, values, st) => {
    const open = values[0];
    const os = changed[1] ? values[1] : [];
    if (open)
        return { state: { open, buf: st.buf.concat(os.map((o) => o.v)) }, out: [] };
    // Closed at the end of the round: emit what the window held, if it was open.
    const out = st.open ? [{ s: R.signalStamp(), v: st.buf }] : [];
    return { state: { open, buf: [] }, out };
});
