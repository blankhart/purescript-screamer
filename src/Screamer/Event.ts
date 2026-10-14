// Foreign module of Screamer.Event. Allocating an event node has no effect
// on the graph, so everything here is pure except `subscribeImpl`.
import type * as Core from './Reactive/Core.js';
// @ts-ignore: purs copies this file to output/Screamer.Event/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';

const R: typeof Core = CoreRuntime;

type E<T> = Core.EventLike<T>;
type S<T> = Core.Readable<T>;

export const mapImpl = <A, B>(f: (a: A) => B) => (e: E<A>): E<B> => R.mapEvent(f, e);

export const altImpl = <A>(a: E<A>) => (b: E<A>): E<A> => R.alt(a, b);

export const emptyImpl: E<any> = R.neverEvent;

export const filterImpl = <A>(p: (a: A) => boolean) => (e: E<A>): E<A> => R.filterEvent(p, e);

export const filterMapImpl = <A, B>(f: (a: A) => { ok: boolean; v: B }) => (e: E<A>): E<B> => R.filterMapEvent(f, e);

export const changes = <A>(s: S<A>): E<A> => R.changes(s);

export const stepper = <A>(seed: A) => (e: E<A>): S<A> => R.stepper(seed, e);

export const fold = <A, B>(f: (a: A) => (b: B) => B) => (seed: B) => (e: E<A>): S<B> =>
  R.foldEvent((a: A, b: B) => f(a)(b), seed, e);

export const attachWith = <A, B, C>(f: (b: B) => (a: A) => C) => (s: S<B>) => (e: E<A>): E<C> =>
  R.attachWith((b: B, a: A) => f(b)(a), s, e);

export const subscribeImpl = <A>(s: Core.Scope) => (e: E<A>) => (cb: (a: A) => () => void) => () => {
  R.subscribeEvent(s, e, (a) => cb(a)());
};
