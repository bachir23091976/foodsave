import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { reconcileNoShows } from "../lib/order-expiration";

export async function reconcileNoShowBatch(_req: Request, res: Response) {
  try {
    const changed = await reconcileNoShows(prisma, {}, 100);
    return res.status(200).json({ changed });
  } catch {
    // Never log raw database errors, identifiers, headers or credentials.
    return res.status(503).json({ error: "RECONCILIATION_FAILED" });
  }
}
