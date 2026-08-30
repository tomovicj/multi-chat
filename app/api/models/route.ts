import auth from "@/lib/auth"
import { getModelCatalog } from "@/lib/models/catalog"
import { headers } from "next/headers"

/**
 * The model catalog, for the picker.
 *
 * Session-guarded so the app is not an open proxy for OpenRouter's catalog.
 * The cross-request cache lives in `getModelCatalog`; the header below only
 * keeps a browser from re-fetching on every popup open.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const catalog = await getModelCatalog()

  return Response.json(catalog, {
    headers: { "Cache-Control": "private, max-age=300" },
  })
}
