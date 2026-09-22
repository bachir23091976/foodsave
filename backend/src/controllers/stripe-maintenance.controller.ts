import { Response } from "express";
import type Stripe from "stripe";
import { AuthRequest } from "../middleware/auth.middleware";
import { stripe } from "../lib/stripe";
import { stripeAccountReadiness } from "../lib/stripe-account-readiness";

// TEMPORARY: remove after the approved synthetic TEST verification is complete.
const ACCOUNT = "acct_1UHv0i7iwGIU8Zhu";
const PERSON = "person_1UHv2V7iwGIU8Zhug6vlaWXr";
const testMode = /^sk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || "");
const noRetry = { maxNetworkRetries: 0 };

function permitted(req: AuthRequest, res: Response): boolean {
  res.setHeader("Cache-Control", "no-store");
  if (!req.userId) { res.status(401).json({ success: false }); return false; }
  if (req.role !== "ADMIN") { res.status(403).json({ success: false }); return false; }
  if (!testMode) { res.status(403).json({ success: false, code: "TEST_MODE_REQUIRED" }); return false; }
  return true;
}

async function readTarget() {
  const account = await stripe.accounts.retrieve(ACCOUNT, {}, noRetry);
  if (account.id !== ACCOUNT || account.type !== "express" || account.country !== "CA") throw new Error("Target mismatch");
  const person = await stripe.accounts.retrievePerson(ACCOUNT, PERSON, {}, noRetry);
  if (person.id !== PERSON || person.account !== ACCOUNT) throw new Error("Target mismatch");
  return { account, person };
}

export const createTestIdentitySession = async (req: AuthRequest, res: Response) => {
  if (!permitted(req, res)) return;
  try {
    await readTarget();
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      related_person: { account: ACCOUNT, person: PERSON },
      options: { document: { require_matching_selfie: true } },
      return_url: "https://myfoodsave.ca/admin/stripe-maintenance",
    }, { ...noRetry, idempotencyKey: "foodsave_test_identity_8Zhu_laWXr_v1" });
    // Never log/return the session object, client_secret or identity outputs.
    if (session.livemode !== false || !session.url) throw new Error("Invalid session");
    const url = new URL(session.url);
    if (url.protocol !== "https:" || url.hostname !== "verify.stripe.com" || url.port || url.username || url.password) {
      throw new Error("Invalid hosted URL");
    }
    return res.json({ success: true, url: url.href });
  } catch {
    // A lost response may mean a session exists. Never retry with a fresh key.
    return res.status(502).json({ success: false, code: "IDENTITY_CREATION_UNCONFIRMED" });
  }
};

const safeCode = (value: unknown): string | null =>
  typeof value === "string" && /^[a-z][a-z0-9_.]{0,150}$/.test(value) ? value : null;
const safeCodes = (values: unknown): string[] | null => Array.isArray(values)
  ? values.map(safeCode).filter((value): value is string => value !== null) : null;
function requirementsSummary(requirements: Stripe.Account.Requirements | Stripe.Person.Requirements | null | undefined) {
  return {
    currentlyDue: safeCodes(requirements?.currently_due),
    pastDue: safeCodes(requirements?.past_due),
    pendingVerification: safeCodes(requirements?.pending_verification),
    errors: requirements?.errors?.map(error => ({ code: safeCode(error.code), requirement: safeCode(error.requirement) })) ?? [],
    alternatives: requirements?.alternatives?.map(alternative => ({
      originalFieldsDue: safeCodes(alternative.original_fields_due),
      alternativeFieldsDue: safeCodes(alternative.alternative_fields_due),
    })) ?? [],
  };
}

export const getTestIdentityStatus = async (req: AuthRequest, res: Response) => {
  if (!permitted(req, res)) return;
  try {
    const { account } = await readTarget();
    return res.json({
      stripeMode: "test",
      account: {
        status: stripeAccountReadiness(account).status,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        transfers: safeCode(account.capabilities?.transfers),
        disabledReason: safeCode(account.requirements?.disabled_reason),
        ...requirementsSummary(account.requirements),
      },
    });
  } catch {
    return res.status(502).json({ success: false, code: "IDENTITY_STATUS_UNAVAILABLE" });
  }
};
