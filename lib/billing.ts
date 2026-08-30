import prisma from "@/lib/prisma";
import { MICROS_PER_CENT } from "@/lib/money";

/**
 * Read a user's balance in micros, converting a pre-micro-dollar document on
 * the way if it has not been converted yet.
 *
 * MongoDB applies Prisma's `@default` on write rather than on read, so a user
 * document written before `balanceMicros` existed simply has no such field.
 * Rather than an offline migration script, the first read of each account
 * converts its whole-cent balance and writes it back — no balance is lost and
 * no separate deploy step is needed. Once every row has been through here,
 * `balanceCents` can be dropped from the schema.
 */
export async function readBalanceMicros(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceMicros: true, balanceCents: true },
  });

  if (!user) {
    return 0;
  }

  if (user.balanceMicros !== null) {
    return user.balanceMicros;
  }

  const converted = (user.balanceCents ?? 0) * MICROS_PER_CENT;

  await prisma.user.update({
    where: { id: userId },
    data: { balanceMicros: converted },
  });

  return converted;
}

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
 * @param costMicros - Whole micro-dollars to subtract; must be positive
 */
export async function deductCost(userId: string, costMicros: number) {
  if (!Number.isInteger(costMicros) || costMicros <= 0) {
    throw new Error(`Refusing to deduct a non-positive cost: ${costMicros}`);
  }

  // Materialise the field first: MongoDB's $inc on a missing field would create
  // it from zero and silently discard the account's pre-conversion balance.
  await readBalanceMicros(userId);

  return prisma.user.update({
    where: { id: userId },
    data: {
      balanceMicros: {
        decrement: costMicros,
      },
    },
  });
}
