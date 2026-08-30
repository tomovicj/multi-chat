import { env } from "@/lib/env";

/**
 * Validate configuration once, when the server boots.
 *
 * Verified against Next's own source, this does *not* run during `next build`:
 * `registerInstrumentation` returns early on
 * `NEXT_PHASE === "phase-production-build"`. That is what lets the Docker image
 * build with no secrets while a container started without them fails here.
 */
export function register() {
  try {
    env();
  } catch (error) {
    // Next logs a failed instrumentation hook and then leaves the process up,
    // answering every request with a 500. In a container that is worse than
    // crashing: the orchestrator sees a live process and never restarts it, and
    // the real cause is buried under two stack traces. Exit instead, so the
    // failure is a crash with one readable reason.
    console.error(
      `\nStartup aborted.\n${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
