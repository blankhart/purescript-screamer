// Foreign module of Screamer.Host. The globals are read inside each call.
type Eff<A> = () => A;

export const browserHost = {
  now: (): number => Date.now(),
  setTimeout: (ms: number) => (action: Eff<void>) => (): Eff<void> => {
    const id = setTimeout(() => action(), ms);
    return () => clearTimeout(id);
  },
  setInterval: (ms: number) => (action: Eff<void>) => (): Eff<void> => {
    const id = setInterval(() => action(), ms);
    return () => clearInterval(id);
  },
  requestFrame: (action: (t: number) => Eff<void>) => (): Eff<void> => {
    const id = requestAnimationFrame((t) => action(t)());
    return () => cancelAnimationFrame(id);
  },
};
