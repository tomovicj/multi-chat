/**
 * Liveness probe for the container orchestrator and the Dockerfile HEALTHCHECK.
 *
 * Deliberately does *not* touch MongoDB or OpenRouter. A health check that
 * queries a dependency turns a brief upstream blip into a restart loop of an
 * otherwise-healthy process, which is worse than the blip. It answers one
 * question — is this Node server accepting and serving requests — and the
 * boot-time check in `instrumentation.ts` already guarantees a process that got
 * this far is configured.
 */

// Never let this be prerendered: a cached "healthy" from build time would be
// a lie the moment the process is anything but.
export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
  })
}
