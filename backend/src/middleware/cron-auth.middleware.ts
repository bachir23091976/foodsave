import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

// Dedicated 32-byte, hex-encoded credential; never a user JWT or URL parameter.
const secretFormat = /^[a-f0-9]{64}$/;
// Temporary diagnostics: fixed literals only; logging must never affect auth.
function diagnostic(marker: "CONFIG_UNAVAILABLE" | "AUTH_REJECTED") {
  try { console.info(`[no-show-cron] ${marker}`); } catch { /* best-effort */ }
}
export function authenticateCron(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretFormat.test(secret)) {
    diagnostic("CONFIG_UNAVAILABLE");
    return res.status(503).json({ error: "UNAVAILABLE" });
  }
  const headerCount = req.rawHeaders.filter((_, index) =>
    index % 2 === 0 && req.rawHeaders[index].toLowerCase() === "authorization").length;
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "");
  if (headerCount !== 1 || !match ||
      !timingSafeEqual(Buffer.from(match[1], "hex"), Buffer.from(secret, "hex"))) {
    diagnostic("AUTH_REJECTED");
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  next();
}
