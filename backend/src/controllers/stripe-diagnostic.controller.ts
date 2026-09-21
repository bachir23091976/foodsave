import { Response, NextFunction } from "express";
import { createHash } from "crypto";
import Stripe from "stripe";
import { AuthRequest } from "../middleware/auth.middleware";
import { prisma } from "../lib/prisma";

// Temporary diagnostic: remove after the TEST environment investigation.
export const diagnosticConfiguration = (_req: AuthRequest, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "changez-moi-en-production") {
    return res.status(503).json({ error: "diagnostic_unavailable" });
  }
  next();
};

const redactId = (id: string) => `${id.split("_")[0]}_...${id.slice(-4)}`;
// Requirement paths can themselves contain Person IDs. Never return free text.
const safeCode = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 200 || !/^[a-zA-Z0-9_.]+$/.test(value)) return null;
  if (/(?:sk|rk|pk)_(?:live|test)_/.test(value)) return null;
  return value.replace(/(?:acct|person)_[a-zA-Z0-9]+/g, redactId);
};
type Requirements = {
  disabled_reason?: string | null;
  currently_due?: string[] | null;
  eventually_due?: string[] | null;
  past_due?: string[] | null;
  pending_verification?: string[] | null;
  errors?: { requirement: string; code: string }[] | null;
};
const requirements = (r?: Requirements | null) => r ? {
  disabledReason: safeCode(r.disabled_reason),
  currentlyDue: r.currently_due?.map(safeCode) ?? null,
  eventuallyDue: r.eventually_due?.map(safeCode) ?? null,
  pastDue: r.past_due?.map(safeCode) ?? null,
  pendingVerification: r.pending_verification?.map(safeCode) ?? null,
  errors: r.errors?.map(e => ({ requirement: safeCode(e.requirement), code: safeCode(e.code) })) ?? null,
} : null;
const safeError = (error: unknown) => {
  const e = error as { statusCode?: number; type?: string; code?: string } | null;
  return {
    statusCode: Number.isInteger(e?.statusCode) && e!.statusCode! >= 400 && e!.statusCode! <= 599 ? e!.statusCode : null,
    type: safeCode(e?.type),
    code: safeCode(e?.code),
  };
};

export const stripeTestDiagnostic = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ error: "unauthorized" });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
    if (user?.role !== "ADMIN") return res.status(403).json({ error: "admin_required" });
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !(key.startsWith("sk_test_") || key.startsWith("rk_test_"))) {
      return res.status(409).json({ error: "test_mode_required" });
    }
    // Fixed investigation target; request parameters cannot select other merchants.
    const merchants = await prisma.merchant.findMany({
      where: { name: "FoodSave Test Ottawa", owner: { canonicalEmail: "noblart2309+merchant@gmail.com", role: "MERCHANT" } },
      select: { stripeAccountId: true }, take: 2,
    });
    const accountId = merchants.length === 1 ? merchants[0].stripeAccountId : null;
    if (!accountId || !/^acct_[a-zA-Z0-9]+$/.test(accountId)) {
      return res.status(404).json({ error: "diagnostic_target_unavailable" });
    }
    const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0, timeout: 15000 });
    let platform;
    try {
      const a = await stripe.accounts.retrieve(null);
      platform = { id: redactId(a.id), fingerprint: createHash("sha256").update(a.id).digest("hex").slice(0, 16), type: safeCode(a.type), country: safeCode(a.country) };
    } catch (error) {
      return res.status(502).json({ stripeMode: "test", error: safeError(error) });
    }
    let account;
    try { account = await stripe.accounts.retrieve(accountId); }
    catch (error) {
      return res.json({ stripeMode: "test", platform, connectedAccountAccessible: false, error: safeError(error) });
    }
    const a = account;
    const result = {
      stripeMode: "test", platform, connectedAccountAccessible: true,
      account: {
        id: redactId(a.id), type: safeCode(a.type), country: safeCode(a.country),
        chargesEnabled: a.charges_enabled, payoutsEnabled: a.payouts_enabled,
        capabilities: { cardPayments: safeCode(a.capabilities?.card_payments), transfers: safeCode(a.capabilities?.transfers) },
        requirements: requirements(a.requirements), futureRequirements: requirements(a.future_requirements),
      },
    };
    const persons = [];
    try {
      for await (const p of stripe.accounts.listPersons(accountId, { limit: 100 })) {
        persons.push({
          id: redactId(p.id), isAccountIndividual: p.id === a.individual?.id,
          relationship: { director: p.relationship?.director ?? null, executive: p.relationship?.executive ?? null, owner: p.relationship?.owner ?? null, representative: p.relationship?.representative ?? null },
          verificationStatus: safeCode(p.verification?.status), requirements: requirements(p.requirements),
        });
      }
    } catch (error) {
      return res.json({ ...result, personsAccessible: false, personError: safeError(error) });
    }
    return res.json({ ...result, personsAccessible: true, persons });
  } catch {
    return res.status(500).json({ error: "diagnostic_unavailable" });
  }
};
