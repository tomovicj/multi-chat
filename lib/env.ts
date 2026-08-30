import { z } from "zod";

/**
 * The server's environment, validated once.
 *
 * Server-only by convention, like `lib/billing.ts` and `lib/models/catalog.ts`:
 * every variable here is a secret or a deployment detail, so importing this
 * from a client component would be a bug. It exists so a misconfigured
 * deployment fails at startup with a list of what is wrong, rather than
 * halfway through a user's first request with a stack trace from inside an SDK.
 *
 * `instrumentation.ts` calls `env()` on boot to force exactly that.
 */

const envSchema = z.object({
  MONGODB_URI: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("mongodb://") || value.startsWith("mongodb+srv://"), {
      message: "must start with mongodb:// or mongodb+srv://",
    }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "must be at least 32 characters — generate one with `openssl rand -base64 32`"),
  /**
   * The origin better-auth signs cookies and builds OAuth callbacks against.
   * Wrong here means the Google round-trip fails, so it is required rather
   * than inferred from the request.
   */
  BETTER_AUTH_URL: z.url(),
  OAUTH_GOOGLE_CLIENT_ID: z.string().min(1),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * The validated environment, parsed on first call and reused thereafter.
 *
 * Throws once, naming *every* variable that is missing or malformed, so a fresh
 * deployment is fixed in one pass instead of one restart per variable.
 */
export function env(): Env {
  if (cached) return cached;

  // `next build` must not require secrets: an image is built once and run in
  // many environments, and CI has no credentials at all. Next sets this phase
  // itself and uses the same guard to skip the instrumentation hook during a
  // build, so a build never reaches the boot-time check either way.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return process.env as unknown as Env;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment. Fix the following, then restart:\n${problems}\n\n` +
        "See .env.example for what each variable is and where to get it.",
    );
  }

  cached = parsed.data;
  return cached;
}
