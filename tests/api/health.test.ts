import { describe, expect, it } from "vitest"

import { GET } from "@/app/api/health/route"

describe("GET /api/health", () => {
  it("answers ok without touching any dependency", async () => {
    // Liveness only: a check that queries MongoDB would turn a brief upstream
    // blip into a restart loop of an otherwise-healthy process.
    const response = GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      uptimeSeconds: expect.any(Number),
    })
  })

  it("reports a whole number of seconds", async () => {
    const body = (await GET().json()) as { uptimeSeconds: number }

    expect(Number.isInteger(body.uptimeSeconds)).toBe(true)
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})
