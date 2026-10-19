// Foreign module of Screamer.Web.Storage. Globals are read only inside the
// calls, and storage that throws (a private window, a sandbox) reads as the
// default and drops writes.

const storageOf = (local: boolean): Storage | null => {
  try {
    return local ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export const readImpl = (local: boolean) => (key: string) => (dflt: string) => (): string => {
  try {
    const v = storageOf(local)?.getItem(key);
    return v === null || v === undefined ? dflt : v;
  } catch {
    return dflt;
  }
};

export const writeImpl = (local: boolean) => (key: string) => (value: string) => (): void => {
  try {
    storageOf(local)?.setItem(key, value);
  } catch {
    // Quota exceeded or storage disabled: the signal still holds the value.
  }
};

/** Call `changed` with the new value (or the default) when another page changes the key. */
export const onStorageImpl =
  (local: boolean) => (key: string) => (dflt: string) => (changed: (v: string) => () => void) => (): (() => void) => {
    const area = storageOf(local);
    const listener = (e: StorageEvent) => {
      if (area === null || e.storageArea !== area) return;
      if (e.key === key) changed(e.newValue === null ? dflt : e.newValue)();
      else if (e.key === null) changed(dflt)(); // clear()
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  };
