"use server";

import prisma from "@/lib/prisma";

export async function getUserBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceCents: true },
  });

  return user?.balanceCents ?? 0;
}
