import { Response } from "express";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { AuthRequest } from "../middleware/auth.middleware";
import { createNotification } from "./notification.controller";
import { checkAndCreateReward } from "./loyalty.controller";

const COMMISSION_PERCENT = 15;

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
      success_url: `http://localhost:3000/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:3000/offers`,
    });

    res.json({ checkoutUrl: session.url });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la creation du paiement", detail: error.message });
  }
};

export const confirmOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId manquant" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Paiement non confirme" });
    }

    const offerId = session.metadata?.offerId;
    const userId = session.metadata?.userId;

    if (!offerId || !userId) {
      return res.status(400).json({ message: "Metadonnees manquantes" });
    }

    const existingOrder = await prisma.order.findFirst({
      where: { offerId, userId, status: { in: ["CONFIRMED", "COMPLETED"] } },
    });

    if (existingOrder) {
      const qrCodeImage = await QRCode.toDataURL(existingOrder.pickupCode);
      return res.json({ message: "Commande deja confirmee", order: existingOrder, qrCodeImage });
    }

    const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { merchant: true } });
    if (!offer || offer.quantity < 1) {
      return res.status(400).json({ message: "Offre indisponible" });
    }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId,
          offerId,
          totalPrice: offer.discountedPrice,
          status: "CONFIRMED",
        },
      });

      await tx.offer.update({
        where: { id: offerId },
        data: { quantity: offer.quantity - 1 },
      });

      return newOrder;
    });

    const clientMessage = "Votre reservation pour " + offer.title + " est confirmee";
    await createNotification(userId, clientMessage);

    const merchantMessage = "Nouvelle commande recue pour " + offer.title;
    await createNotification(offer.merchant.ownerId, merchantMessage);

    const qrCodeImage = await QRCode.toDataURL(order.pickupCode);

    res.status(201).json({ message: "Reservation confirmee", order, qrCodeImage });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur", detail: error.message });
  }
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

    if (order.status === "COMPLETED") {
      return res.status(400).json({ message: "Cette commande a deja ete recuperee" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { status: "COMPLETED" },
    });

    const pickupMessage = "Votre commande " + order.offer.title + " a ete recuperee avec succes";
    await createNotification(order.userId, pickupMessage);

    await checkAndCreateReward(order.userId);

    res.json({ message: "Commande validee avec succes", order: updatedOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
