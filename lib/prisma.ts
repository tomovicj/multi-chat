import { PrismaClient } from "@/prisma/generated/client";

/**
 * The one Prisma client for the process.
 *
 * Kept on `globalThis` outside production because Next re-evaluates modules on
 * every hot reload: without this, each edit during `pnpm dev` constructs a new
 * client and opens a fresh connection pool, and an Atlas cluster reaches its
 * connection cap after a handful of saves. Production has no HMR, so the plain
 * module-level instance is correct there and nothing is attached to the global.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
