import type Stripe from "stripe";

// One policy for display and Checkout admission. Unknown requirements fail closed.
export function stripeAccountReadiness(account: Pick<Stripe.Account, "capabilities" | "charges_enabled" | "payouts_enabled" | "requirements">) {
  const transfersActive = account.capabilities?.transfers === "active";
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const due = account.requirements?.currently_due;
  const currentlyDue = Array.isArray(due) ? due : [];
  const ready = transfersActive && chargesEnabled && payoutsEnabled && Array.isArray(due) && due.length === 0;
  return { status: ready ? "READY" as const : "ONBOARDING_INCOMPLETE" as const,
    transfersActive, chargesEnabled, payoutsEnabled, currentlyDue };
}
