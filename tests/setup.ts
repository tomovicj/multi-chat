/**
 * Global test setup.
 *
 * Two globals have to exist before any module under test is imported, which is
 * why they live here rather than in individual files.
 */

/**
 * `lib/env.ts` validates these six on first call, and `lib/auth.ts` calls
 * `env()` at module scope — so importing anything that reaches auth throws
 * without them. The values only have to satisfy the schema; nothing is dialled.
 */
const TEST_ENV = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/test",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-chars-long",
  OAUTH_GOOGLE_CLIENT_ID: "test-client-id",
  OAUTH_GOOGLE_CLIENT_SECRET: "test-client-secret",
  OPENROUTER_API_KEY: "test-openrouter-key",
} as const

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] = value
}

/**
 * zustand's `persist` defaults its storage to `window.localStorage`, and when
 * that is missing it returns without attaching the `persist` API at all — so
 * `model-store.ts` would be untestable rather than merely unpersisted. An
 * in-memory stub is enough, and is cheaper than pulling in a DOM library for
 * one store.
 */
function createLocalStorageStub(): Storage {
  const entries = new Map<string, string>()

  return {
    get length() {
      return entries.size
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value))
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
    clear: () => {
      entries.clear()
    },
  }
}

const localStorageStub = createLocalStorageStub()

Object.defineProperty(globalThis, "window", {
  value: { localStorage: localStorageStub },
  writable: true,
  configurable: true,
})

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageStub,
  writable: true,
  configurable: true,
})
