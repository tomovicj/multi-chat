import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const VALID = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/app",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "a-secret-that-is-at-least-32-characters",
  OAUTH_GOOGLE_CLIENT_ID: "client-id",
  OAUTH_GOOGLE_CLIENT_SECRET: "client-secret",
  OPENROUTER_API_KEY: "openrouter-key",
}

/**
 * `env()` memoises in a module-level `cached`, so every case needs a fresh copy
 * of the module or the first parse decides all the others.
 */
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()

  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    if (value === undefined) {
      vi.stubEnv(key, undefined as unknown as string)
    } else {
      vi.stubEnv(key, value)
    }
  }

  const { env } = await import("@/lib/env")
  return env
}

beforeEach(() => {
  vi.stubEnv("NEXT_PHASE", undefined as unknown as string)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("env", () => {
  it("returns the parsed environment when everything is set", async () => {
    const env = await loadEnv({})

    expect(env().OPENROUTER_API_KEY).toBe("openrouter-key")
    expect(env().MONGODB_URI).toBe("mongodb://127.0.0.1:27017/app")
  })

  it("names every bad variable in one throw, not just the first", async () => {
    const env = await loadEnv({
      MONGODB_URI: undefined,
      BETTER_AUTH_SECRET: "too-short",
      OPENROUTER_API_KEY: undefined,
    })

    // The whole point is fixing a fresh deployment in one pass rather than one
    // restart per variable.
    expect(() => env()).toThrow(/MONGODB_URI/)
    expect(() => env()).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => env()).toThrow(/OPENROUTER_API_KEY/)
  })

  it("points at .env.example so the reader knows where to look", async () => {
    const env = await loadEnv({ OPENROUTER_API_KEY: undefined })

    expect(() => env()).toThrow(/\.env\.example/)
  })

  it.each([
    ["mongodb://host/db", true],
    ["mongodb+srv://host/db", true],
    ["postgres://host/db", false],
    ["host/db", false],
  ])("accepts %s as a Mongo URI: %s", async (uri, valid) => {
    const env = await loadEnv({ MONGODB_URI: uri })

    if (valid) {
      expect(env().MONGODB_URI).toBe(uri)
    } else {
      expect(() => env()).toThrow(/mongodb:\/\/ or mongodb\+srv:\/\//)
    }
  })

  it("requires an auth secret of at least 32 characters", async () => {
    const thirtyOne = "a".repeat(31)
    const shortEnv = await loadEnv({ BETTER_AUTH_SECRET: thirtyOne })

    expect(() => shortEnv()).toThrow(/BETTER_AUTH_SECRET/)

    const exactEnv = await loadEnv({ BETTER_AUTH_SECRET: "a".repeat(32) })

    expect(exactEnv().BETTER_AUTH_SECRET).toHaveLength(32)
  })

  it.each(["example.com", "not a url", ""])(
    "rejects %s as BETTER_AUTH_URL",
    async (url) => {
      const env = await loadEnv({ BETTER_AUTH_URL: url })

      expect(() => env()).toThrow(/BETTER_AUTH_URL/)
    },
  )

  it("lets a scheme-less host:port through BETTER_AUTH_URL", async () => {
    // Characterising a gap, not endorsing it. `z.url()` defers to the WHATWG
    // parser, which reads "localhost:" as the scheme and "3000" as the path, so
    // the one mistake `.env.example` warns about ("must include the scheme")
    // is the one this check does not catch. Google's callback is built against
    // this value, so it fails later, at the OAuth round-trip, which is exactly
    // what validating at boot is meant to prevent.
    const env = await loadEnv({ BETTER_AUTH_URL: "localhost:3000" })

    expect(() => env()).not.toThrow()
  })

  it("skips validation during a production build", async () => {
    // This is what lets `next build` and `docker build` run with no secrets at
    // all — an image is built once and run in many environments.
    vi.stubEnv("NEXT_PHASE", "phase-production-build")

    const env = await loadEnv({
      MONGODB_URI: undefined,
      BETTER_AUTH_SECRET: undefined,
      OPENROUTER_API_KEY: undefined,
    })

    expect(() => env()).not.toThrow()
  })

  it("parses once and reuses the result", async () => {
    const env = await loadEnv({})
    const first = env()

    vi.stubEnv("OPENROUTER_API_KEY", "changed-after-the-first-call")

    expect(env()).toBe(first)
    expect(env().OPENROUTER_API_KEY).toBe("openrouter-key")
  })
})
