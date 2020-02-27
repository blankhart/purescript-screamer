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

export const emit = <T>(o: Observable<() => T>) => () => {
  return o()();
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

// No way to destroy this by unsubscribing, unless the base observable value is modified to contain its unsubscribe function.  This may be difficult to carry along because downstream users should not necessarily cause their parents to unsubscribe unless they can guarantee that the parent subscription is single-use.
export const merge_ = <S>(a: Observable<S>) => (b: Observable<S>) => {
  const o = observable(sample(a));
  //  return computed(() => {
  const unsubscribe_a = subscribe(() => o(a()));
  const unsubscribe_b = subscribe(() => o(b()));
  //    cleanup(() => {
  //      unsubscribe_a();
  //      unsubscribe_b();
  //    });
  //    return o();
  //  });
  return o;
}
