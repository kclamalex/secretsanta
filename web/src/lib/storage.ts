/**
 * A namespaced slice of localStorage: keys become `${prefix}:${normalize(key)}`.
 * Every call is safe where storage is blocked (private mode) and just remembers nothing.
 */
export function localStore(prefix: string, normalize = (key: string) => key) {
  const full = (key: string) => `${prefix}:${normalize(key)}`;
  return {
    get: (key: string) => {
      try { return localStorage.getItem(full(key)); } catch { return null; }
    },
    set: (key: string, value: string) => {
      try { localStorage.setItem(full(key), value); } catch { /* private mode */ }
    },
    clear: (key: string) => {
      try { localStorage.removeItem(full(key)); } catch { /* private mode */ }
    },
  };
}

export type LocalStore = ReturnType<typeof localStore>;
