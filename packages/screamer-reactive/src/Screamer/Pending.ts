// Foreign module of Screamer.Pending. Each scope that has had work counted
// gets a count cell; registering work increments the cells of the scope and
// every ancestor, and `done` decrements the same cells. The counts are
// written at once, not deferred to the next round, because `suspense` samples
// them right after building its content, whose work starts in subscribers.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Pending/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Scope = Runtime.Scope;
type Eff<A> = () => A;

const counts = new WeakMap<Scope, Runtime.Cell<number>>();
// Work still outstanding on each scope, done when the scope is disposed.
const outstanding = new WeakMap<Scope, Set<Eff<void>>>();

function countOf(s: Scope): Runtime.Cell<number> {
  let c = counts.get(s);
  if (c === undefined) {
    c = R.cell(0);
    counts.set(s, c);
  }
  return c;
}

const add = (cells: Runtime.Cell<number>[], d: number) =>
  R.batch(() => {
    for (const c of cells) c.writeNow(c.value + d);
  });

const noop = () => {};

export const pendingImpl = (s: Scope) => (): Eff<void> => {
  if (s.disposed) return noop;
  const cells: Runtime.Cell<number>[] = [];
  for (let x: Scope | null = s; x !== null; x = x.parent) cells.push(countOf(x));
  let work = outstanding.get(s);
  if (work === undefined) {
    const w = new Set<Eff<void>>();
    outstanding.set(s, w);
    s.cleanups.push(() => {
      for (const d of [...w]) d();
    });
    work = w;
  }
  const set = work;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    set.delete(done);
    add(cells, -1);
  };
  set.add(done);
  add(cells, 1);
  return done;
};

export const settledImpl = (s: Scope) => (): Runtime.Readable<boolean> => {
  const c = countOf(s);
  return R.derived(() => c.read() === 0);
};
