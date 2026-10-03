import { PrismaClient } from "@prisma/client";
import { reconcileNoShows } from "../lib/order-expiration";

// Explicit operator/scheduler invocation only; never imported by server startup.
async function main() {
  const db = new PrismaClient();
  try {
    let changed = 0;
    for (let batch = 0; batch < 10; batch++) {
      const count = await reconcileNoShows(db, {}, 100);
      changed += count;
      if (count === 0) break;
    }
    console.log(JSON.stringify({ changed }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(() => {
  console.error("NO_SHOW reconciliation failed"); process.exitCode = 1;
});
