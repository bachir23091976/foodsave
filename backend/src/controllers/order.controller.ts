import { Request, Response } from "express";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { lockCheckout, recoveryToken, acquireRecovery, assertRecoveryOwner, releaseRecovery } from "../lib/sold-out-recovery-coordination";
import { AuthRequest } from "../middleware/auth.middleware";
import { createNotification } from "./notification.controller";
import { checkAndCreateReward } from "./loyalty.controller";

const COMMISSION_PERCENT = 15;
const REFERRAL_DISCOUNT_PERCENT = 15;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

async function checkAndRewardReferral(userId: string) {
  try {
    const completedCount = await prisma.order.count({
      where: { userId, status: "COMPLETED" },
    });
    if (completedCount !== 1) { return; }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });
    if (!user?.referredById) { return; }
    await prisma.loyaltyReward.create({ data: { userId: user.referredById, discountCad: REFERRAL_DISCOUNT_PERCENT } });
    await prisma.loyaltyReward.create({ data: { userId, discountCad: REFERRAL_DISCOUNT_PERCENT } });
    await createNotification(user.referredById, "Votre filleul a complete sa premiere commande, vous avez recu une recompense");
    await createNotification(userId, "Merci d avoir utilise un code de parrainage, vous avez recu une recompense");
  } catch (error) {
    console.error("Erreur recompense parrainage:", error);
  }
}

export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { offerId } = req.body;

    if (!offerId) {
      return res.status(400).json({ message: "offerId manquant" });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { merchant: true },
    });

    if (!offer) {
      return res.status(404).json({ message: "Offre introuvable" });
    }

    if (offer.quantity < 1) {
      return res.status(400).json({ message: "Cette offre n'est plus disponible" });
    }

    if (offer.pickupEnd.getTime() < Date.now()) {
      return res.status(400).json({ message: "La fenetre de recuperation de cette offre est terminee" });
    }

    if (!offer.merchant.stripeAccountId) {
      return res.status(400).json({ message: "Ce commerce n'a pas encore configure ses paiements" });
    }

    const amountInCents = Math.round(offer.discountedPrice * 100);
    const commissionInCents = Math.round((amountInCents * COMMISSION_PERCENT) / 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: { name: offer.title },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: commissionInCents,
        transfer_data: {
          destination: offer.merchant.stripeAccountId,
        },
      },
      metadata: {
        offerId: offer.id,
        userId: userId as string,
      },
      success_url: `${FRONTEND_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/offers`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la creation du paiement", detail: error.message });
  }
};

type ConfirmResult = { status: number; body: Record<string, unknown>; retryWebhook?: boolean };
type RefundStatus = "NOT_REQUESTED" | "UNKNOWN" | "PENDING" | "REQUIRES_ACTION" |
  "SUCCEEDED" | "FAILED" | "CANCELED" | "NEEDS_REVIEW";
type Resolution = {
  stripeSessionId: string;
  paymentIntentId: string | null;
  refundId: string | null;
  refundStatus: RefundStatus;
  refundFirstAttemptAt: Date | null;
  manuallySettled?: boolean;
  recoveryOwnerToken?: string | null;
};
const REFUND_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const decisionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

// Parameterized SQL accesses only the additive table. Its presence permanently
// means REFUND_REQUIRED, independent of refund progress or stock restoration.
async function readResolution(tx: Prisma.TransactionClient, sessionId: string) {
  const rows = await tx.$queryRaw<Resolution[]>`
    SELECT r.*, EXISTS (SELECT 1 FROM "SoldOutManualSettlement" m
      WHERE m."stripeSessionId" = r."stripeSessionId") AS "manuallySettled"
    FROM "SoldOutResolution" r WHERE r."stripeSessionId" = ${sessionId}
  `;
  return rows[0] ?? null;
}

async function existingOrderResult(order: { pickupCode: string }): Promise<ConfirmResult> {
  const qrCodeImage = await QRCode.toDataURL(order.pickupCode);
  return { status: 200, body: { message: "Commande deja confirmee", order, qrCodeImage } };
}

function refundResult(resolution: Resolution): ConfirmResult {
  const succeeded = resolution.refundStatus === "SUCCEEDED" || !!resolution.manuallySettled;
  return {
    status: 409,
    body: { message: resolution.manuallySettled
      ? "Cette offre est epuisee. Votre remboursement a ete effectue et verifie par FoodSave."
      : succeeded
      ? "Cette offre est epuisee : un autre client a reserve la derniere unite entre-temps. Votre paiement a ete rembourse automatiquement."
      : "Cette offre est epuisee. Votre remboursement est en cours de traitement ou de verification par FoodSave." },
    retryWebhook: !succeeded,
  };
}

// The database predicate excludes SUCCEEDED. No-ID errors cannot erase a saved
// refund ID. Conflicting IDs are retained and flagged, never overwritten.
async function persistRefundState(
  sessionId: string, expectedPaymentIntent: string | null,
  incoming: RefundStatus, refundId: string | null = null, errorMessage: string | null = null,
  ownerToken: string | null = null, definitive = true
) {
  return prisma.$transaction(async (tx) => {
    await lockCheckout(tx, sessionId);
    const order = await tx.order.findUnique({ where: { stripeSessionId: sessionId } });
    if (order) return { order, resolution: null };
    const current = await readResolution(tx, sessionId);
    if (!current) throw new Error("Resolution de remboursement introuvable");
    if (current.refundStatus === "SUCCEEDED" || current.manuallySettled) return { order: null, resolution: current };
    assertRecoveryOwner(current.recoveryOwnerToken, ownerToken);
    const conflict = current.paymentIntentId !== expectedPaymentIntent ||
      (!!refundId && !!current.refundId && current.refundId !== refundId);
    const status = conflict ? "NEEDS_REVIEW" : incoming;
    const acceptedId = conflict ? null : refundId;
    const message = conflict ? "Identifiants de remboursement incoherents" : errorMessage;
    await tx.$executeRaw`
      UPDATE "SoldOutResolution"
      SET "refundStatus" = CAST(${status} AS "SoldOutRefundStatus"),
          "refundId" = COALESCE(CAST(${acceptedId} AS text), "refundId"),
          "lastError" = ${status === "SUCCEEDED" ? null : message},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "stripeSessionId" = ${sessionId}
        AND "refundStatus" <> 'SUCCEEDED'
        AND (CAST(${acceptedId} AS text) IS NULL OR "refundId" IS NULL OR "refundId" = ${acceptedId})
    `;
    if (ownerToken && definitive && !conflict && incoming !== "UNKNOWN") await releaseRecovery(tx, sessionId, ownerToken);
    return { order: null, resolution: (await readResolution(tx, sessionId))! };
  }, decisionOptions);
}

async function recoverSoldOutRefund(sessionId: string): Promise<ConfirmResult> {
  const token = recoveryToken();
  // No Stripe call until the decision AND this first-attempt claim commit.
  const claim = await prisma.$transaction(async (tx) => {
    await lockCheckout(tx, sessionId);
    const order = await tx.order.findUnique({ where: { stripeSessionId: sessionId } });
    if (order) return { order, resolution: null, first: false };
    const resolution = await readResolution(tx, sessionId);
    if (!resolution) throw new Error("Resolution de remboursement introuvable");
    if (resolution.refundStatus === "SUCCEEDED" || resolution.manuallySettled ||
        resolution.recoveryOwnerToken || ["FAILED", "CANCELED", "NEEDS_REVIEW"].includes(resolution.refundStatus)) {
      return { order: null, resolution, first: false, stopped: true };
    }
    await acquireRecovery(tx, sessionId, token);
    let first = false;
    if (!resolution.manuallySettled && resolution.paymentIntentId && resolution.refundStatus === "NOT_REQUESTED") {
      const count = await tx.$executeRaw`
        UPDATE "SoldOutResolution"
        SET "refundStatus" = 'UNKNOWN', "refundFirstAttemptAt" = CURRENT_TIMESTAMP,
            "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "stripeSessionId" = ${sessionId} AND "refundStatus" = 'NOT_REQUESTED'
          AND "refundFirstAttemptAt" IS NULL AND "refundId" IS NULL
      `;
      first = count === 1;
    }
    return { order: null, resolution: (await readResolution(tx, sessionId))!, first };
  }, decisionOptions);
  if (claim.order) return existingOrderResult(claim.order);
  const resolution = claim.resolution!;
  if ("stopped" in claim && claim.stopped) return refundResult(resolution);
  const paymentIntentId = resolution.paymentIntentId;
  const finish = async (status: RefundStatus, id: string | null = null, message: string | null = null, definitive = true) => {
    const saved = await persistRefundState(sessionId, paymentIntentId, status, id, message, token, definitive);
    return saved.order ? existingOrderResult(saved.order) : refundResult(saved.resolution!);
  };
  if (resolution.refundStatus === "SUCCEEDED" || resolution.manuallySettled) return refundResult(resolution);
  if (!paymentIntentId) return finish("NEEDS_REVIEW", null, "PaymentIntent manquant");
  if (["FAILED", "CANCELED", "NEEDS_REVIEW"].includes(resolution.refundStatus)) return refundResult(resolution);

  try {
    let refund: Stripe.Refund | undefined;
    if (resolution.refundId) {
      refund = await stripe.refunds.retrieve(resolution.refundId);
    } else if (!claim.first) {
      // Paginate: a first-page miss is not evidence that no refund exists.
      // Multiple or partial refunds require review rather than another refund.
      const found: Stripe.Refund[] = [];
      for await (const candidate of stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
        found.push(candidate);
        if (found.length > 1) break;
      }
      if (found.length > 1) return finish("NEEDS_REVIEW", null, "Plusieurs remboursements a verifier");
      if (found.length === 1) {
        const payment = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (found[0].amount !== payment.amount_received) {
          return finish("NEEDS_REVIEW", null, "Remboursement partiel a verifier");
        }
        refund = found[0];
      }
    }
    if (!refund) {
      const age = resolution.refundFirstAttemptAt
        ? Date.now() - resolution.refundFirstAttemptAt.getTime() : NaN;
      if (!Number.isFinite(age) || age < 0 || age >= REFUND_RETRY_WINDOW_MS) {
        return finish("NEEDS_REVIEW", null, "Tentative incertaine hors de la fenetre de reprise");
      }
      refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reverse_transfer: true,
        refund_application_fee: true,
      }, { idempotencyKey: `refund_sold_out_${sessionId}` });
    }
    const refundPaymentIntent = typeof refund.payment_intent === "string"
      ? refund.payment_intent : refund.payment_intent?.id;
    if (refundPaymentIntent !== paymentIntentId ||
        (resolution.refundId && resolution.refundId !== refund.id)) {
      return finish("NEEDS_REVIEW", null, "Le remboursement ne correspond pas au paiement attendu", false);
    }
    const statuses: Record<string, RefundStatus> = {
      succeeded: "SUCCEEDED", pending: "PENDING", requires_action: "REQUIRES_ACTION",
      failed: "FAILED", canceled: "CANCELED",
    };
    const status = refund.status ? statuses[refund.status] : undefined;
    return finish(status ?? "UNKNOWN", refund.id,
      status ? null : "Statut Stripe non reconnu");
  } catch (error) {
    const saved = await persistRefundState(sessionId, paymentIntentId, "UNKNOWN", null,
      "Resultat Stripe incertain; verification necessaire", token);
    if (saved.order) return existingOrderResult(saved.order);
    if (saved.resolution!.refundStatus === "SUCCEEDED" || saved.resolution!.manuallySettled) return refundResult(saved.resolution!);
    throw error;
  }
}

// Both callers use the same lock and committed order-or-refund decision.
async function confirmPaidSession(
  session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "metadata" | "payment_intent">,
  requestUserId?: string
): Promise<ConfirmResult> {
  if (session.payment_status !== "paid") {
    return { status: 400, body: { message: "Paiement non confirme" } };
  }
  const offerId = session.metadata?.offerId;
  const userId = session.metadata?.userId;
  if (!offerId || !userId) return { status: 400, body: { message: "Metadonnees manquantes" } };
  if (requestUserId && userId !== requestUserId) {
    return { status: 403, body: { message: "Cette session de paiement ne vous appartient pas" } };
  }
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent : session.payment_intent?.id ?? null;
  const decision = await prisma.$transaction(async (tx) => {
    await lockCheckout(tx, session.id);
    // Issue #1: a legitimate same-session order always wins, before refund lookup.
    const existing = await tx.order.findUnique({ where: { stripeSessionId: session.id } });
    if (existing) return { kind: "EXISTING" as const, order: existing };
    if (await readResolution(tx, session.id)) return { kind: "REFUND" as const };
    const offer = await tx.offer.findUnique({ where: { id: offerId }, include: { merchant: true } });
    if (!offer) return { kind: "MISSING" as const };
    const decremented = await tx.offer.updateMany({
      where: { id: offerId, quantity: { gt: 0 } },
      data: { quantity: { decrement: 1 } },
    });
    if (decremented.count === 0) {
      await tx.$executeRaw`
        INSERT INTO "SoldOutResolution" ("stripeSessionId", "paymentIntentId", "updatedAt")
        VALUES (${session.id}, ${paymentIntentId}, CURRENT_TIMESTAMP)
      `;
      return { kind: "REFUND" as const }; // Commit, never roll back this decision.
    }
    const order = await tx.order.create({ data: {
      userId, offerId, totalPrice: offer.discountedPrice,
      status: "CONFIRMED", stripeSessionId: session.id,
    } });
    return { kind: "CREATED" as const, order, offer };
  }, decisionOptions);
  // A rejected/uncertain commit cannot authorize any Stripe call.
  if (decision.kind === "EXISTING") return existingOrderResult(decision.order);
  if (decision.kind === "REFUND") return recoverSoldOutRefund(session.id);
  if (decision.kind === "MISSING") return { status: 400, body: { message: "Offre indisponible" } };
  const { order, offer } = decision;
  await createNotification(userId, "Votre reservation pour " + offer.title + " est confirmee");
  await createNotification(offer.merchant.ownerId, "Nouvelle commande recue pour " + offer.title);
  const qrCodeImage = await QRCode.toDataURL(order.pickupCode);
  return { status: 201, body: { message: "Reservation confirmee", order, qrCodeImage } };
}

export const confirmOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId manquant" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const result = await confirmPaidSession(session, req.userId);

    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur", detail: error.message });
  }
};

// Stripe webhook endpoint -- the authoritative source of truth for payment
// confirmation. Unlike confirmOrder (which the client calls after being
// redirected back from Checkout, and which can be skipped entirely if the
// user closes their browser tab before the redirect happens), Stripe
// guarantees this fires and retries delivery until it gets a 2xx response,
// so it's what actually makes order confirmation reliable end-to-end.
//
// req.body here MUST be the raw, unparsed request bytes (see the
// express.raw() mount registered in index.ts, ahead of the global
// express.json()) -- stripe.webhooks.constructEvent recomputes the signature
// over those exact bytes and rejects anything that was parsed and would be
// re-serialized differently.
export const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET manquant - impossible de verifier la signature");
    return res.status(500).json({ message: "Webhook non configure" });
  }

  if (!signature) {
    return res.status(400).json({ message: "Signature manquante" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error: any) {
    console.error(`[stripe-webhook] Signature invalide: ${error.message}`);
    return res.status(400).json({ message: "Signature invalide" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const result = await confirmPaidSession(session);
      if (result.retryWebhook) return res.status(500).json({ message: "Erreur serveur" });
      if (result.status >= 400) {
        console.error("[stripe-webhook] checkout.session.completed non traite:", result.body);
      }
    } catch (error) {
      console.error("[stripe-webhook] Erreur traitement checkout.session.completed:", error);
      // A non-2xx response tells Stripe to retry this delivery later.
      return res.status(500).json({ message: "Erreur serveur" });
    }
  }

  res.json({ received: true });
};

export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: { offer: { include: { merchant: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const cancelOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "orderId manquant" });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { offer: true },
    });

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    if (order.status === "CANCELLED") {
      return res.status(400).json({ message: "Cette commande est deja annulee" });
    }

    if (order.status === "COMPLETED") {
      return res.status(400).json({ message: "Une commande deja recuperee ne peut pas etre annulee" });
    }

    if (order.status !== "CONFIRMED") {
      return res.status(400).json({ message: "Cette commande ne peut pas etre annulee" });
    }

    const cancellationDeadline = order.offer.pickupStart.getTime() - 60 * 60 * 1000;
    if (Date.now() >= cancellationDeadline) {
      return res.status(400).json({
        message: "Le delai d'annulation est depasse. L'annulation doit etre faite au moins 60 minutes avant la recuperation.",
      });
    }

    if (!order.stripeSessionId) {
      return res.status(400).json({ message: "Paiement Stripe introuvable" });
    }

    const claim = await prisma.order.updateMany({
      where: { id: order.id, userId, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancellationReason: "\u0041nnul\u00e9e par le client" },
    });

    if (claim.count === 0) {
      return res.status(409).json({ message: "Cette commande a deja ete traitee" });
    }

    let refundSucceeded = false;

    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ["payment_intent"],
      });

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      if (!paymentIntentId) {
        throw new Error("PaymentIntent introuvable");
      }

      await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `customer_cancel_${order.id}` }
      );

      refundSucceeded = true;

      await prisma.offer.update({
        where: { id: order.offerId },
        data: { quantity: { increment: 1 } },
      });

      await createNotification(
        userId as string,
        `Votre commande ${order.offer.title} a ete annulee et remboursee`
      ).catch((notificationError) => {
        console.error("Erreur notification annulation:", notificationError);
      });

      return res.json({
        message: "Commande annulee. Le remboursement a ete envoye vers votre moyen de paiement.",
      });
    } catch (error) {
      if (!refundSucceeded) {
        await prisma.order.updateMany({
          where: { id: order.id, userId, status: "CANCELLED" },
          data: { status: "CONFIRMED", cancellationReason: null },
        });
      }

      console.error("Erreur annulation commande:", error);
      return res.status(500).json({
        message: refundSucceeded
          ? "Le remboursement a reussi, mais le stock doit etre verifie par FoodSave."
          : "Impossible d'effectuer le remboursement. La commande reste active.",
      });
    }
  } catch (error) {
    console.error("Erreur annulation commande:", error);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

export const cancelOrderByMerchant = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { orderId, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "orderId manquant" });
    }

    const cancellationReason = typeof reason === "string" ? reason.trim() : "";
    if (cancellationReason.length < 3 || cancellationReason.length > 200) {
      return res.status(400).json({
        message: "Veuillez choisir ou saisir un motif d annulation valide",
      });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { ownerId: userId },
    });

    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouve" });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        offer: { merchantId: merchant.id },
      },
      include: { offer: true },
    });

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable pour ce commerce" });
    }

    if (order.status !== "CONFIRMED") {
      return res.status(400).json({
        message: order.status === "CANCELLED"
          ? "Cette commande est deja annulee"
          : "Cette commande ne peut pas etre annulee",
      });
    }

    if (!order.stripeSessionId) {
      return res.status(400).json({ message: "Paiement Stripe introuvable" });
    }

    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancellationReason },
    });

    if (claim.count === 0) {
      return res.status(409).json({ message: "Cette commande a deja ete traitee" });
    }

    let refundSucceeded = false;

    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ["payment_intent"],
      });

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      if (!paymentIntentId) {
        throw new Error("PaymentIntent introuvable");
      }

      await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `merchant_cancel_${order.id}` }
      );

      refundSucceeded = true;

      await prisma.offer.update({
        where: { id: order.offerId },
        data: { quantity: { increment: 1 } },
      });

      await createNotification(
        order.userId,
        `Le commerce a annule votre commande ${order.offer.title}. Motif : ${cancellationReason}. Votre paiement a ete rembourse.`
      ).catch((notificationError) => {
        console.error("Erreur notification annulation commercant:", notificationError);
      });

      return res.json({
        message: "Commande annulee et client rembourse avec succes",
      });
    } catch (error) {
      if (!refundSucceeded) {
        await prisma.order.updateMany({
          where: { id: order.id, status: "CANCELLED" },
          data: { status: "CONFIRMED", cancellationReason: null },
        });
      }

      console.error("Erreur annulation par commercant:", error);
      return res.status(500).json({
        message: refundSucceeded
          ? "Le remboursement a reussi, mais le stock doit etre verifie par FoodSave."
          : "Impossible d'effectuer le remboursement. La commande reste active.",
      });
    }
  } catch (error) {
    console.error("Erreur annulation par commercant:", error);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMerchantOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouve" });
    }

    const orders = await prisma.order.findMany({
      where: { offer: { merchantId: merchant.id } },
      include: {
        offer: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const validatePickup = async (req: AuthRequest, res: Response) => {
  try {
    const { pickupCode } = req.body;

    if (!pickupCode) {
      return res.status(400).json({ message: "pickupCode manquant" });
    }

    const order = await prisma.order.findUnique({
      where: { pickupCode },
      include: { offer: { include: { merchant: true } } },
    });

    if (!order) {
      return res.status(404).json({ message: "Commande introuvable" });
    }

    if (order.offer.merchant.ownerId !== req.userId) {
      return res.status(403).json({ message: "Cette commande n'appartient pas a votre commerce" });
    }

    if (order.status !== "CONFIRMED") {
      return res.status(400).json({
        message: order.status === "CANCELLED"
          ? "Cette commande a ete annulee"
          : "Cette commande ne peut pas etre validee",
      });
    }

    // Atomic, conditional status flip: only one concurrent validation request
    // can move this order out of COMPLETED-not-yet-set. This closes a race
    // where two near-simultaneous scans of the same code would otherwise both
    // pass the check above and both trigger the loyalty/referral reward logic.
    const updateResult = await prisma.order.updateMany({
      where: { id: order.id, status: "CONFIRMED" },
      data: { status: "COMPLETED" },
    });

    if (updateResult.count === 0) {
      return res.status(400).json({ message: "Cette commande a deja ete recuperee" });
    }

    const updatedOrder = (await prisma.order.findUnique({ where: { id: order.id } }))!;

    const pickupMessage = "Votre commande " + order.offer.title + " a ete recuperee avec succes";
    await createNotification(order.userId, pickupMessage);

    await checkAndCreateReward(order.userId);
    await checkAndRewardReferral(order.userId);

    res.json({ message: "Commande validee avec succes", order: updatedOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

