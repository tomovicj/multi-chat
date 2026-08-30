import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";

const auth = betterAuth({
  // better-auth would find BETTER_AUTH_URL in the environment on its own, but
  // passing it keeps `lib/env.ts` the single place the origin is declared and
  // validated. It also fixes trustedOrigins, which defaults to this value.
  baseURL: env().BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "mongodb",
  }),
  socialProviders: {
    google: {
      clientId: env().OAUTH_GOOGLE_CLIENT_ID,
      clientSecret: env().OAUTH_GOOGLE_CLIENT_SECRET,
    },
  }
});

export default auth;
