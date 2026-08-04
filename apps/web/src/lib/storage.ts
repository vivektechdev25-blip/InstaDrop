interface StorageEntry<T> {
  value: T;
  expiresAt: number | null;
}

export function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const entry: StorageEntry<T> = JSON.parse(raw);
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      window.localStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function writeStorage<T>(key: string, value: T, ttlMs?: number): void {
  if (typeof window === "undefined") return;
  try {
    const entry: StorageEntry<T> = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled (e.g. private browsing) - every
    // caller of this module treats persistence as a progressive
    // enhancement, so failing silently here is correct, not a shortcut.
  }
}

export function removeStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See writeStorage - same reasoning.
  }
}
