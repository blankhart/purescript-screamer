import * as sinuous from 'sinuous/observable';
import { Observable } from 'sinuous/observable';

/////////////////////////////////
// Channel

export const channel = <T>(t: T) => () => {
  const signal = sinuous.observable(t);
  return { 
    signal: signal,
    put: (t: T) => () => signal(t),
    modify: (f: (_: T) => T) => () => signal(f(sinuous.sample(signal))),
  };
}

/*
const put = <T>(o: Observable<T>) => (t: T) => () => {
  return o(t);
}

const modify = <T>(f: (_: T) => T) => (o: Observable<T>) => () => {
  return o(f(sinuous.sample(o)));
}
*/

/////////////////////////////////
// Signal

export const get = <T>(o: Observable<T>) => () => {
  return sinuous.sample(o);
}

export const sampleOn = <S>(a: Observable<S>) => <T>(b: Observable<T>) => {
  return sinuous.computed(() => { a(); return sinuous.sample(b); });
}

export const emit = <T>(e: Observable<() => T>) => () => {
  return e()();
}

export const pure_ = <T>(t: T) => {
  return sinuous.observable(t);
}

export const map_ = <S, T>(f: (_: S) => T) => (o: Observable<S>) => {
  return sinuous.computed(() => f(o()));
}

export const apply_ = <S, T>(f: Observable<(_: S) => T>) => (s: Observable<S>) => {
  return sinuous.computed(() => f()(s()));
}

export const merge = <S>(a: Observable<S>) => (b: Observable<S>) => {
  const o = sinuous.observable(sinuous.sample(a));
  sinuous.subscribe(() => o(a()));
  sinuous.subscribe(() => o(b()));
  return o;
}

export const filter = <S>(f: (_: S) => boolean) => (seed: S) => (sig: Observable<S>) => {
  const s = sinuous.sample(sig);
  const o = sinuous.observable(f(s) ? s : seed);
  sinuous.subscribe(() => {
    const v = sig();
    if (f(v)) o(v);
  });
  return o;
};

export const fold = <S, T>(f: (_: S) => (_: T) => T) => (seed: T) => (sig: Observable<S>) => {
  var acc = seed;
  return sinuous.computed(() => {
    acc = f(sig())(acc);
    return acc;
  });
};

// IGNORE

export const trial = <T>(action: () => T) => (cleanups: () => {}) => () => {
  return sinuous.computed(() => {
    sinuous.cleanup(cleanups);
    return action();
  });
};
