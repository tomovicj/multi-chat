"use server";

import prisma from "@/lib/prisma";
import auth from "@/lib/auth";
import { headers } from "next/headers";

/**
 * Get the signed-in user's balance in cents.
 *
 * Takes no user id on purpose: as a server action this is a public endpoint, so
 * accepting one would let anyone read any account's balance by guessing ids.
 */
export async function getUserBalance(): Promise<number> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balanceCents: true },
  });

  return user?.balanceCents ?? 0;
}
