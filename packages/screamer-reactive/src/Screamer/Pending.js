// @ts-ignore: purs copies this file to output/Screamer.Pending/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const counts = new WeakMap();
// Work still outstanding on each scope, done when the scope is disposed.
const outstanding = new WeakMap();
function countOf(s) {
    let c = counts.get(s);
    if (c === undefined) {
        c = R.cell(0);
        counts.set(s, c);
    }
    return c;
}
const add = (cells, d) => R.batch(() => {
    for (const c of cells)
        c.putT0(c.value + d);
});
const noop = () => { };
export const pendingImpl = (s) => () => {
    if (s.disposed)
        return noop;
    const cells = [];
    for (let x = s; x !== null; x = x.parent)
        cells.push(countOf(x));
    let work = outstanding.get(s);
    if (work === undefined) {
        const w = new Set();
        outstanding.set(s, w);
        s.cleanups.push(() => {
            for (const d of [...w])
                d();
        });
        work = w;
    }
    const set = work;
    let finished = false;
    const done = () => {
        if (finished)
            return;
        finished = true;
        set.delete(done);
        add(cells, -1);
    };
    set.add(done);
    add(cells, 1);
    return done;
};
// The count updates on every change, so `settled` drops the repeats of
// `count === 0` itself, and is held in `s` from now on.
export const settledImpl = (s) => () => {
    const c = countOf(s);
    const idle = R.derived(() => c.read() === 0);
    const node = R.stateful([idle], () => idle.read(), (_, values, shown) => (values[0] === shown ? R.noUpdate : values[0]), 'Pending.settled');
    R.effectIn(s, () => { node.read(); });
    return node;
};
