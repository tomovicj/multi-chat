import prisma from "@/lib/prisma";

/**
 * Deduct the cost of a completion from a user's balance.
 *
 * Deliberately NOT a server action. Every export of a `"use server"` module is a
 * POST endpoint any client can call with arguments of its choosing, and a
 * balance mutation reachable that way can be handed a negative amount to credit
 * the account instead. Keeping this in a plain module means the only way in is
 * server-side code that has already established whose balance it is spending.
 *
 * @param userId - Resolved from the session by the caller, never from the request body
 * @param costInCents - Whole cents to subtract; must be positive
 */
export async function deductCost(userId: string, costInCents: number) {
  if (!Number.isInteger(costInCents) || costInCents <= 0) {
    throw new Error(`Refusing to deduct a non-positive cost: ${costInCents}`);
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      balanceCents: {
        decrement: costInCents,
      },
    },
  });
}
