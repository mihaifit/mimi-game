import type { StorageLike } from '../src/core/save';

export class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

export const HOUR = 3_600_000;
