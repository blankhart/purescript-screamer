import { sample, computed, observable, subscribe, cleanup, Observable } from 'sinuous/observable';

/////////////////////////////////
// Channel

export const channel = <T>(t: T) => () => {
  return observable(t);
}

export const send = <T>(o: Observable<T>) => (t: T) => () => {
  return o(t);
}

export const modify = <T>(f: (_: T) => T) => (o: Observable<T>) => () => {
  return o(f(o()));
}

/////////////////////////////////
// Signal

export const get = <T>(o: Observable<T>) => () => {
  return o();
}

export const emit = <T>(e: Observable<() => T>) => () => {
  return e()();
}

export const pure_ = <T>(t: T) => () => {
  return observable(t);
}

export const map_ = <S, T>(f: (_: S) => T) => (o: Observable<S>) => {
  return computed(() => f(o()));
}

export const apply_ = <S, T>(f: Observable<(_: S) => T>) => (s: Observable<S>) => {
  return computed(() => f()(s()));
}

export const merge = <S>(a: Observable<S>) => (b: Observable<S>) => {
  const o = observable(sample(a));
  subscribe(() => o(a()));
  subscribe(() => o(b()));
  return o;
}

export const filter = <S>(f: (_: S) => boolean) => (seed: S) => (sig: Observable<S>) => {
  const s = sample(sig);
  const o = observable(f(s) ? s : seed);
  subscribe(() => {
    const v = sig();
    if (f(v)) o(v);
  });
  return o;
};

export const fold = <S, T>(f: (_: S) => (_: T) => T) => (seed: T) => (sig: Observable<S>) => {
  var acc = seed;
  return computed(() => {
    acc = f(sig())(acc);
    return acc;
  });
};

// IGNORE

export const trial = <T>(action: () => T) => (cleanups: () => {}) => () => {
  return computed(() => {
    cleanup(cleanups);
    return action();
  });
};
