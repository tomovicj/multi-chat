import { beforeEach, describe, expect, it, vi } from "vitest"

import { catalogModel } from "@/tests/fixtures"

const getSession = vi.fn()
const getModelCatalog = vi.fn()

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/auth", () => ({ default: { api: { getSession } } }))
vi.mock("@/lib/models/catalog", () => ({ getModelCatalog }))

const { GET } = await import("@/app/api/models/route")

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ user: { id: "user-1" } })
  getModelCatalog.mockResolvedValue({
    models: [catalogModel({ id: "anthropic/claude-opus-5" })],
    degraded: false,
  })
})

describe("GET /api/models", () => {
  it("refuses without a session, so the app is not an open proxy", async () => {
    getSession.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(getModelCatalog).not.toHaveBeenCalled()
  })

  it("returns the catalog to a signed-in user", async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    const body = (await response.json()) as { models: unknown[]; degraded: boolean }
    expect(body.degraded).toBe(false)
    expect(body.models).toHaveLength(1)
  })

  it("lets the browser hold the catalog briefly, but privately", async () => {
    const response = await GET()

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300")
  })
})
