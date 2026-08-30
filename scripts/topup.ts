/**
 * Grant a user credit, in dollars.
 *
 *   pnpm topup someone@example.com 5
 *
 * There is no admin UI and no payment provider, so this is how a balance gets
 * off zero. Run with tsx rather than plain node: the generated Prisma client
 * uses extensionless imports that Node's ESM resolver rejects.
 */
// Same reason prisma.config.ts does this: nothing outside Next's runtime
// loads .env on its own.
import "dotenv/config";

import prisma from "@/lib/prisma";
import { readBalanceMicros } from "@/lib/billing";
import { MICROS_PER_USD, formatMicros } from "@/lib/money";

// Prisma maps Int to Int32 on MongoDB, so this is the hard ceiling a balance
// can hold. Adding past it would silently wrap rather than error.
const MAX_BALANCE_MICROS = 2_147_483_647;

async function main() {
  const [email, amount] = process.argv.slice(2);

  if (!email || !amount) {
    console.error("Usage: pnpm topup <email> <dollars>");
    process.exit(1);
  }

  const dollars = Number(amount);

  if (!Number.isFinite(dollars) || dollars <= 0) {
    console.error(`Not a positive dollar amount: ${amount}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error(`No user with email ${email}. They must sign in once first.`);
    process.exit(1);
  }

  // Converts a pre-micro-dollar account on the way, so the increment below
  // cannot discard an old whole-cent balance.
  const before = await readBalanceMicros(user.id);
  const added = Math.round(dollars * MICROS_PER_USD);
  const after = before + added;

  if (after > MAX_BALANCE_MICROS) {
    console.error(
      `Would exceed the Int32 ceiling of ${formatMicros(MAX_BALANCE_MICROS)}; ` +
        `balance is already ${formatMicros(before)}.`,
    );
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { balanceMicros: { increment: added } },
  });

  console.log(
    `${user.email}: ${formatMicros(before)} -> ${formatMicros(after)} (+${formatMicros(added)})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
