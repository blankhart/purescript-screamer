// Foreign module of Screamer.Context. A key's name is a property of scope
// contexts, which `Runtime.lookupContext` finds by walking up to the nearest
// scope that provides anything. Contexts have no prototype but each other, so
// no name clashes with an inherited property.
import type * as Runtime from './Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Context/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Scope = Runtime.Scope;
type Eff<A> = () => A;

interface Key<A> {
  name: string;
  default: A;
}

export const provideImpl = (s: Scope) => <A>(k: Key<A>) => (value: A) => <B>(body: (s: Scope) => Eff<B>) => (): B => {
  if (s.disposed) throw new Error(`provide ${k.name} in a disposed scope`);
  const c = R.createScope(s);
  R.tagScope(c, 'provide');
  const ctx: Runtime.Context = Object.create(R.contextOf(s));
  ctx[k.name] = value;
  c.ctx = ctx;
  return R.batch(() => R.runInScope(c, () => body(c)()));
};

export const askImpl = (s: Scope) => <A>(k: Key<A>) => (): A => R.lookupContext(s, k.name, k.default);

// The id counter lives on the root scope's own context object. It is read
// from the root directly, never by lookup, so contexts provided before it
// was created need not see it.
const counter = Symbol('uniqueId');

export const uniqueIdImpl = (s: Scope) => (): string => {
  let root = s;
  while (root.parent !== null) root = root.parent;
  if (root.ctx === null) root.ctx = Object.create(null) as Runtime.Context;
  const n = Object.prototype.hasOwnProperty.call(root.ctx, counter) ? (root.ctx[counter] as number) : 0;
  root.ctx[counter] = n + 1;
  return `s${n}`;
};
