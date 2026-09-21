import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { stripe } from "../lib/stripe";

// TEMPORARY: remove after the approved TEST maintenance operation is verified.
const ACCOUNT = "acct_1UHv0i7iwGIU8Zhu";
const PERSON = "person_1UHv2V7iwGIU8Zhug6vlaWXr";
const FILE = "file_1UI5rNBFFa4Liz3NiOOa2F3D";
// Capture at module initialization, alongside the shared client's configuration.
const testMode = /^sk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || "");
const safeCode = (value: unknown): string | null =>
  typeof value === "string" && /^[a-z][a-z0-9_.]{0,150}$/.test(value) ? value : null;
const safeCodes = (values: unknown): string[] => Array.isArray(values)
  ? values.map(safeCode).filter((value): value is string => value !== null) : [];

export const attachTestPersonDocument = async (req: AuthRequest, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  if (!req.userId) return res.status(401).json({ success: false });
  if (req.role !== "ADMIN") return res.status(403).json({ success: false });
  if (!testMode) return res.status(403).json({ success: false, code: "TEST_MODE_REQUIRED" });

  let updateSucceeded = false;
  try {
    const account = await stripe.accounts.retrieve(ACCOUNT);
    if (account.id !== ACCOUNT || account.type !== "express" || account.country !== "CA") {
      return res.status(409).json({ success: false, code: "TARGET_MISMATCH" });
    }
    const person = await stripe.accounts.retrievePerson(ACCOUNT, PERSON);
    if (person.id !== PERSON || person.account !== ACCOUNT) {
      return res.status(409).json({ success: false, code: "TARGET_MISMATCH" });
    }
    await stripe.accounts.updatePerson(ACCOUNT, PERSON, {
      verification: { document: { front: FILE } },
    }, { idempotencyKey: "foodsave_test_person_document_1UI5rNBFFa4Liz3NiOOa2F3D" });
    updateSucceeded = true;
    const verified = await stripe.accounts.retrieve(ACCOUNT);
    if (verified.id !== ACCOUNT) throw new Error("Target mismatch");
    return res.json({
      success: true,
      chargesEnabled: verified.charges_enabled,
      payoutsEnabled: verified.payouts_enabled,
      transfers: safeCode(verified.capabilities?.transfers),
      requirements: {
        currentlyDue: safeCodes(verified.requirements?.currently_due),
        pastDue: safeCodes(verified.requirements?.past_due),
        pendingVerification: safeCodes(verified.requirements?.pending_verification),
        disabledReason: safeCode(verified.requirements?.disabled_reason),
      },
    });
  } catch {
    // Never log provider objects or claim a timed-out mutation did not happen.
    return res.status(502).json({ success: false, updateSucceeded,
      code: updateSucceeded ? "POST_UPDATE_VERIFICATION_UNAVAILABLE" : "MAINTENANCE_OUTCOME_UNCONFIRMED" });
  }
};
