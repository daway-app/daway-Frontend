import { beforeEach, describe, expect, it } from 'vitest';
import { createTokenManager, type TokenStorage } from './tokenStorage';

function fakeStorage(initial: string | null = null): TokenStorage & {
  value: string | null;
  writes: number;
} {
  const store = {
    value: initial,
    writes: 0,
    get() {
      return store.value;
    },
    set(token: string) {
      store.value = token;
      store.writes += 1;
    },
    clear() {
      store.value = null;
    },
  };
  return store;
}

describe('createTokenManager', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it('hydrates from storage on first read', () => {
    const manager = createTokenManager(fakeStorage('persisted'));
    expect(manager.get()).toBe('persisted');
  });

  it('returns null when storage is empty', () => {
    const manager = createTokenManager(storage);
    expect(manager.get()).toBeNull();
  });

  it('writes through and serves from memory', () => {
    const manager = createTokenManager(storage);
    manager.set('tok-1');

    expect(storage.value).toBe('tok-1');
    expect(manager.get()).toBe('tok-1');

    // Second read must not hit storage again (hydrated).
    const reads = storage.writes;
    manager.get();
    expect(storage.writes).toBe(reads);
  });

  it('clears both memory and storage', () => {
    const manager = createTokenManager(storage);
    manager.set('tok-1');
    manager.clear();

    expect(manager.get()).toBeNull();
    expect(storage.value).toBeNull();
  });

  it('does not re-read storage after an explicit clear', () => {
    const manager = createTokenManager(fakeStorage('persisted'));
    manager.get(); // hydrate
    manager.clear();
    expect(manager.get()).toBeNull();
  });
});
