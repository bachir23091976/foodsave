import { Request, Response } from "express";
import { types } from "node:util";
import { prisma } from "../lib/prisma";
import { reconcileNoShows } from "../lib/order-expiration";

// Temporary diagnostics. Never stringify errors or invoke their accessors.
function safeCode(error: unknown): string {
  try {
    if (!error || typeof error !== "object") return "OTHER";
    if (types.isProxy(error)) return "OTHER";
    for (const key of ["code", "errorCode"]) {
      const descriptor = Object.getOwnPropertyDescriptor(error, key);
      if (!descriptor || !("value" in descriptor)) continue;
      switch (descriptor.value) {
        case "P1001": return "P1001";
        case "P1002": return "P1002";
        case "P1008": return "P1008";
        case "P1017": return "P1017";
        case "P2021": return "P2021";
        case "P2022": return "P2022";
        case "P2024": return "P2024";
        case "P2028": return "P2028";
        case "P2034": return "P2034";
      }
    }
  } catch { /* Uninspectable errors also remain opaque. */ }
  return "OTHER";
}
function diagnostic(marker: "RECONCILE_START" | "RECONCILE_OK" | "RECONCILE_FAILED" | "RESPONSE_FAILED", error?: unknown) {
  try {
    console.info(`[no-show-cron] ${marker}${marker === "RECONCILE_FAILED" ? ` code=${safeCode(error)}` : ""}`);
  } catch { /* Logging must not change the HTTP outcome. */ }
}

export async function reconcileNoShowBatch(_req: Request, res: Response) {
  let reconciled = false;
  try {
    diagnostic("RECONCILE_START");
    const changed = await reconcileNoShows(prisma, {}, 100);
    reconciled = true;
    diagnostic("RECONCILE_OK");
    return res.status(200).json({ changed });
  } catch (error) {
    diagnostic(reconciled ? "RESPONSE_FAILED" : "RECONCILE_FAILED", error);
    // Never log raw database errors, identifiers, headers or credentials.
    return res.status(503).json({ error: "RECONCILIATION_FAILED" });
  }
}
