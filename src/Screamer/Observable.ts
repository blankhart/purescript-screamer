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

// Since this is constant, no need to return observable(t)
export const pure_ = <T>(t: T) => {
  return () => t;
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

export const filterOn = <S>(cond: Observable<boolean>) => (seed: S) => (sig: Observable<S>) => {
  let c = sinuous.sample(cond);
  let s = sinuous.sample(sig);
  const o = sinuous.observable(c ? s : seed);
  sinuous.subscribe(() => {
    s = sig();
    c = sinuous.sample(cond);
    if (c) o(s);
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

export const distinct = <T>(sig: Observable<T>) => {
  let s = sinuous.sample(sig);
  const o = sinuous.observable(s);
  sinuous.subscribe(() => {
    const v = sig();
    if (v !== s) {
      s = v;
      o(s);
    }
  });
  return o;
};

export const nonequal = <T>(eq: (_: T) => (_: T) => Boolean) => (sig: Observable<T>) => {
  let s = sinuous.sample(sig);
  const o = sinuous.observable(s);
  sinuous.subscribe(() => {
    const v = sig();
    if (!eq(v)(s)) {
      s = v;
      o(s);
    }
  });
  return o;
};

// sampled is a record of sampled values
// depended is a record of depended-on values
export const _sampleManyWith = (sampled: any) => (tracked: any) => (f: (_: any) => any) => {
  return sinuous.computed(() => {
    let obj = {};
    for (let [k, v] of Object.entries(sampled)) {
      //      console.log(`sampling ${k}: ${sinuous.sample(v as any)}`);
      obj[k] = sinuous.sample(v as any);
    }
    for (let [k, v] of Object.entries(tracked)) {
      //      console.log(`tracking ${k}: ${v()}`);
      obj[k] = (v as any)();
    }
    console.log(`calling ${f} on ${obj}`);
    return f(obj);
  });
}

// IGNORE

export const trial = <T>(action: () => T) => (cleanups: () => {}) => () => {
  return sinuous.computed(() => {
    sinuous.cleanup(cleanups);
    return action();
  });
};
