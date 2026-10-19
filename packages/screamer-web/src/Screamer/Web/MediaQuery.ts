// Foreign module of Screamer.Web.MediaQuery.

export const matchImpl = (query: string) => (changed: (m: boolean) => () => void) => (): { now: boolean; stop: () => void } => {
  const mql = window.matchMedia(query);
  const listener = (e: MediaQueryListEvent) => changed(e.matches)();
  mql.addEventListener('change', listener);
  return { now: mql.matches, stop: () => mql.removeEventListener('change', listener) };
};
