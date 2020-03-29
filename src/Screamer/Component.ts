import { computed, cleanup, Observable } from 'sinuous/observable';

export const computed_ = <T>(result: Observable<T>) => (cleanups: () => {}) => {
  return computed(() => {
    cleanup(cleanups);
    return result();
  });
};
