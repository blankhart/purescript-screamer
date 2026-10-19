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
export const take = (n) => (e) => accum((a, k) => (k < n ? { state: k + 1, emit: true, value: a } : { state: k, emit: false }), () => 0)(e);
export const skip = (n) => (e) => accum((a, k) => (k < n ? { state: k + 1, emit: false } : { state: k, emit: true, value: a }), () => 0)(e);
export const takeWhile = (p) => (e) => accum((a, done) => (!done && p(a) ? { state: false, emit: true, value: a } : { state: true, emit: false }), () => false)(e);
export const skipWhile = (p) => (e) => accum((a, open) => (open || !p(a) ? { state: true, emit: true, value: a } : { state: false, emit: false }), () => false)(e);
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
/** The occurrences of the leftmost input that fired in the round. */
export function leftmost(es) {
    return R.eventDerived((r) => {
        let out = NONE;
        // Read every input, so each records its version and stays linked.
        for (let i = 0; i < es.length; i++) {
            const os = r.occ(es[i]);
            if (out.length === 0)
                out = os;
        }
        return out;
    });
}
/**
 * Both events' occurrences in stamp order. An occurrence of each with the
 * same stamp (both derived from one fire) are combined with `both`.
 */
function mergeWithNode(both, left, right, ea, eb) {
    return R.eventDerived((r) => {
        const as = r.occ(ea);
        const bs = r.occ(eb);
        if (as.length === 0 && bs.length === 0)
            return NONE;
        const out = [];
        let i = 0;
        let j = 0;
        while (i < as.length || j < bs.length) {
            if (j >= bs.length || (i < as.length && as[i].s < bs[j].s)) {
                out.push({ s: as[i].s, v: left(as[i].v) });
                i++;
            }
            else if (i >= as.length || bs[j].s < as[i].s) {
                out.push({ s: bs[j].s, v: right(bs[j].v) });
                j++;
            }
            else {
                out.push({ s: as[i].s, v: both(as[i].v, bs[j].v) });
                i++;
                j++;
            }
        }
        return out;
    });
}
/**
 * Pairs the nth occurrence of `ea` with the nth of `eb`, counting from when
 * it is observed. Unpaired occurrences queue without bound. A paused zip
 * drops its queues, because what they would be paired with is missed.
 */
function zip(f, ea, eb) {
    return R.eventStateful([ea, eb], () => ({ as: [], bs: [] }), (changed, values, st) => {
        // Take the round's occurrences in stamp order, pairing as they come.
        const as = changed[0] ? values[0] : NONE;
        const bs = changed[1] ? values[1] : NONE;
        const qa = st.as.slice();
        const qb = st.bs.slice();
        const out = [];
        let i = 0;
        let j = 0;
        while (i < as.length || j < bs.length) {
            const takeA = j >= bs.length || (i < as.length && as[i].s <= bs[j].s);
            if (takeA) {
                const o = as[i++];
                if (qb.length > 0)
                    out.push({ s: o.s, v: f(o.v, qb.shift().v) });
                else
                    qa.push(o);
            }
            else {
                const o = bs[j++];
                if (qa.length > 0)
                    out.push({ s: o.s, v: f(qa.shift().v, o.v) });
                else
                    qb.push(o);
            }
        }
        return { state: { as: qa, bs: qb }, out };
    }, () => ({ as: [], bs: [] }));
}
/**
 * Follows the first input to fire after it is first observed (the leftmost,
 * if several fire in that round), and ignores the others from then on.
 */
export function race(es) {
    return R.eventStateful(es, () => -1, (changed, values, winner) => {
        if (winner < 0)
            winner = changed.indexOf(true);
        return { state: winner, out: winner >= 0 && changed[winner] ? values[winner] : NONE };
    });
}
export const mergeWith = (both) => (left) => (right) => (ea) => (eb) => mergeWithNode((a, b) => both(a)(b), left, right, ea, eb);
export const zipWith = (f) => (ea) => (eb) => zip((a, b) => f(a)(b), ea, eb);
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
