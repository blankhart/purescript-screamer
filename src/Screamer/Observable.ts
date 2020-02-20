import { computed, observable, Observable } from 'sinuous/observable';

export function new_<T>(t: T): () => Observable<T> {
  return () => observable(t);
}

export function get<T>(o: Observable<T>) {
  return function () {
    return o();
  }
}

export function put<T>(t: T) {
  return function (o: Observable<T>) {
    return () => o(t);
  }
}

export function modify<T>(f: (_: T) => T) {
  return function (o: Observable<T>) {
    return function () {
      return o(f(o()));
    }
  }
}

export function observe<T>(f: () => T): Observable<T> {
  return computed(f);
}