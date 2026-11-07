// @ts-ignore: purs copies this file to output/Screamer.Event.Extra/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const NONE = [];
const accum = (f, seed) => (e) => () => R.accumEvent(f, seed, e);
// Transform and filter (#19).
export const takeImpl = (n) => (e) => accum((a, k) => (k < n ? { state: k + 1, emit: true, value: a } : { state: k, emit: false }), () => 0)(e);
export const skipImpl = (n) => (e) => accum((a, k) => (k < n ? { state: k + 1, emit: false } : { state: k, emit: true, value: a }), () => 0)(e);
export const takeWhileImpl = (p) => (e) => accum((a, done) => (!done && p(a) ? { state: false, emit: true, value: a } : { state: true, emit: false }), () => false)(e);
export const skipWhileImpl = (p) => (e) => accum((a, open) => (open || !p(a) ? { state: true, emit: true, value: a } : { state: false, emit: false }), () => false)(e);
// Combining several streams (#20). Node constructors with more than one
// argument take them uncurried and are wrapped below for PureScript.
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
 * it is made. Unpaired occurrences queue without bound.
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
 * Follows the first input to fire after it is made (the leftmost, if several
 * fire in that round), and ignores the others from then on.
 */
export const raceImpl = (es) => () => raceNode(es);
function raceNode(es) {
    return R.eventStateful(es, () => -1, (changed, values, winner) => {
        if (winner < 0)
            winner = changed.indexOf(true);
        return { state: winner, out: winner >= 0 && changed[winner] ? values[winner] : NONE };
    });
}
export const mergeWith = (both) => (left) => (right) => (ea) => (eb) => mergeWithNode((a, b) => both(a)(b), left, right, ea, eb);
export const zipWithImpl = (f) => (ea) => (eb) => () => zip((a, b) => f(a)(b), ea, eb);
// Buffering (#23).
export const bufferCountImpl = (n) => (step) => (e) => {
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
export const bufferOnImpl = (notifier) => (e) => () => R.eventStateful([e, notifier], () => [], (changed, values, held) => {
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
export const bufferWhileImpl = (cond) => (e) => () => R.eventStateful([cond, e], () => ({ open: cond.read(), buf: [] }), (changed, values, st) => {
    const open = values[0];
    const os = changed[1] ? values[1] : [];
    if (open)
        return { state: { open, buf: st.buf.concat(os.map((o) => o.v)) }, out: [] };
    // Closed at the end of the round: emit what the window held, if it was open.
    const out = st.open ? [{ s: R.signalStamp(), v: st.buf }] : [];
    return { state: { open, buf: [] }, out };
});
