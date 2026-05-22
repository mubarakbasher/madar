/**
 * Provide a `window.localStorage` shim so the offline-layer tests can run in
 * the bare `node` Vitest environment without pulling in jsdom. Dexie itself
 * runs against `fake-indexeddb/auto` (imported by each test file).
 */

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const g = globalThis as unknown as {
  window?: { localStorage: Storage };
  localStorage?: Storage;
};

if (!g.window) {
  g.window = { localStorage: new MemoryStorage() };
}
if (!g.localStorage) {
  g.localStorage = g.window.localStorage;
}
