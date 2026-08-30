import { createAuthClient } from "better-auth/react";

/**
 * No `baseURL`: better-auth falls back to `window.location.origin` in the
 * browser (see getBaseURL in better-auth/dist/utils/url.mjs). Naming an origin
 * here would have to come from a NEXT_PUBLIC_* variable, and those are inlined
 * at build time — which would pin every built image to one hostname and, as it
 * did before, silently point production at http://localhost:3000.
 */
export const authClient = createAuthClient()
