import { sample, computed, observable, subscribe, cleanup, Observable } from 'sinuous/observable';

// import { sample, computed, observable, subscribe, cleanup, Observable } from 's-js';

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

// No way to destroy this by unsubscribing, unless the base observable value is modified to contain its unsubscribe function.
// This may be difficult to carry along because downstream users should not necessarily cause their parents to unsubscribe unless they can guarantee that the parent subscription is single-use.
export const merge_ = <S>(a: Observable<S>) => (b: Observable<S>) => {
  const o = observable(sample(a));
  const unsubscribe_a = subscribe(() => o(a()));
  const unsubscribe_b = subscribe(() => o(b()));
  return o;
  /*
    return computed(() => {
      const unsubscribe_a = subscribe(() => o(a()));
      const unsubscribe_b = subscribe(() => o(b()));
      // cleanup(() => {
      //  unsubscribe_a();
      //  unsubscribe_b();
      // });
      return o();
    });
  */
  /*
  // Doesn't work b/c just toggles on repeats
  var x: S = sample(a);
  return computed(() => {
    var ta: S = a();
    var tb: S = b();
    console.log(`x is ${x}, ta is ${ta}, tb is ${tb}`);
    return x = (x === ta) ? tb : ta;
  });
 */
}

export const filter = <S>(f: (_: S) => boolean) => (seed: S) => (sig: Observable<S>) => {
  const s = sample(sig);
  const o = observable(f(s) ? s : seed);
  const unsubscribe = subscribe(() => {
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
