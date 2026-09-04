import { Request, Response } from "express";
import Stripe from "stripe";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
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

type ConfirmResult = { status: number; body: Record<string, unknown> };

// Shared, idempotent order-confirmation logic used by both confirmOrder
// (client-triggered, right after Stripe redirects back to success_url) and
// the /orders/webhook handler (Stripe-triggered, authoritative). Both call
// sites end up doing exactly the same validation and the exact same atomic
// "decrement offer quantity + create order" transaction, so a bug fixed here
// is fixed for both paths instead of drifting between two copies.
//
// requestUserId is only provided by confirmOrder (the authenticated caller);
// the webhook has no logged-in user making the request, so that ownership
// check is skipped there and the metadata.userId Stripe already recorded at
// checkout-creation time is trusted instead.
async function confirmPaidSession(
  session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "metadata" | "payment_intent">,
  requestUserId?: string
): Promise<ConfirmResult> {
  if (session.payment_status !== "paid") {
    return { status: 400, body: { message: "Paiement non confirme" } };
  }

  const offerId = session.metadata?.offerId;
  const userId = session.metadata?.userId;

  if (!offerId || !userId) {
    return { status: 400, body: { message: "Metadonnees manquantes" } };
  }

  if (requestUserId && userId !== requestUserId) {
    return { status: 403, body: { message: "Cette session de paiement ne vous appartient pas" } };
  }

  // Sole idempotency key: this exact Stripe Checkout Session. Because
  // stripeSessionId is unique in the database, at most one order can ever
  // exist for a given session.id -- if one is already there (created by an
  // earlier confirmOrder call, an earlier webhook delivery, or the other of
  // the two racing each other), we just return it instead of creating a
  // second order for the same payment. This is deliberately scoped to the
  // session alone: the same user buying the same offer again through a
  // *different* paid Checkout Session is a separate purchase and must
  // produce a separate order.
  const existingBySession = await prisma.order.findUnique({ where: { stripeSessionId: session.id } });
  if (existingBySession) {
    const qrCodeImage = await QRCode.toDataURL(existingBySession.pickupCode);
    return { status: 200, body: { message: "Commande deja confirmee", order: existingBySession, qrCodeImage } };
  }

  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { merchant: true } });
  if (!offer) {
    return { status: 400, body: { message: "Offre indisponible" } };
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      // Atomic, conditional decrement: only succeeds if quantity is still > 0
      // at the moment the row is locked, preventing a lost-update race where
      // two near-simultaneous confirmations both read the same stale quantity
      // and both believe they got the last unit.
      const decremented = await tx.offer.updateMany({
        where: { id: offerId, quantity: { gt: 0 } },
        data: { quantity: { decrement: 1 } },
      });

      if (decremented.count === 0) {
        throw new Error("OFFER_SOLD_OUT");
      }

      // stripeSessionId is unique, so if another request (the webhook vs.
      // confirmOrder, or two retried webhook deliveries) already created the
      // order for this exact session between our check above and this
      // transaction, this insert throws instead of creating a duplicate.
      return tx.order.create({
        data: {
          userId,
          offerId,
          totalPrice: offer.discountedPrice,
          status: "CONFIRMED",
          stripeSessionId: session.id,
        },
      });
    });
  } catch (error: any) {
    if (error.message === "OFFER_SOLD_OUT") {
      // The payment already succeeded (payment_status === "paid" was checked
      // at the top of this function), but the atomic quantity guard found
      // nothing left to sell -- another confirmation won the last unit in
      // the moment between our check and the transaction's lock. The
      // customer was charged for something that no longer exists, so refund
      // them automatically instead of leaving them out of pocket with no
      // order to show for it.
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

      if (!paymentIntentId) {
        // Nothing to refund against. Rethrow so the webhook responds 500 and
        // Stripe retries delivery -- never silently tell the customer they
        // were refunded when no refund could be attempted.
        console.error(
          `[stripe-webhook] Offre epuisee pour la session ${session.id} mais aucun payment_intent -- remboursement impossible`
        );
        throw error;
      }

      try {
        // Idempotency key derived from the Checkout Session id: if Stripe
        // retries this webhook delivery (e.g. this handler failed after the
        // refund but before returning a 2xx), the retried call reuses the
        // same key and Stripe's API returns the original refund instead of
        // creating a second one -- the customer is never refunded twice for
        // the same session.
        await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            reverse_transfer: true,
            refund_application_fee: true,
          },
          { idempotencyKey: `refund_sold_out_${session.id}` }
        );
      } catch (refundError: any) {
        // The refund attempt itself failed -- rethrow so the webhook
        // responds 500 and Stripe retries delivery (which will retry the
        // refund too, safely, via the same idempotency key).
        console.error(`[stripe-webhook] Echec du remboursement pour la session ${session.id}:`, refundError);
        throw error;
      }

      return {
        status: 409,
        body: {
          message:
            "Cette offre est epuisee : un autre client a reserve la derniere unite entre-temps. Votre paiement a ete rembourse automatiquement.",
        },
      };
    }

    // P2002 = Prisma unique constraint violation on stripeSessionId. The
    // whole transaction (including the quantity decrement) was rolled back
    // automatically, so nothing was double-counted -- the other request that
    // won the race already created the order, so fetch and return it.
    if (error.code === "P2002") {
      const raceWinner = await prisma.order.findUnique({ where: { stripeSessionId: session.id } });
      if (raceWinner) {
        const qrCodeImage = await QRCode.toDataURL(raceWinner.pickupCode);
        return { status: 200, body: { message: "Commande deja confirmee", order: raceWinner, qrCodeImage } };
      }
    }

    throw error;
  }

  const clientMessage = "Votre reservation pour " + offer.title + " est confirmee";
  await createNotification(userId, clientMessage);

  const merchantMessage = "Nouvelle commande recue pour " + offer.title;
  await createNotification(offer.merchant.ownerId, merchantMessage);

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
      data: { status: "CANCELLED" },
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
          data: { status: "CONFIRMED" },
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

