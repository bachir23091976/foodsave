import { Response } from "express";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { offerId } = req.body;

    if (!offerId) {
      return res.status(400).json({ message: "offerId manquant" });
    }

    const offer = await prisma.offer.findUnique({ where: { id: offerId } });

    if (!offer) {
      return res.status(404).json({ message: "Offre introuvable" });
    }

    if (offer.quantity < 1) {
      return res.status(400).json({ message: "Cette offre n'est plus disponible" });
    }

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: userId as string,
          offerId: offer.id,
          totalPrice: offer.discountedPrice,
          status: "CONFIRMED",
        },
      });

      await tx.offer.update({
        where: { id: offer.id },
        data: { quantity: offer.quantity - 1 },
      });

      return newOrder;
    });

    const qrCodeImage = await QRCode.toDataURL(order.pickupCode);

    res.status(201).json({ message: "Réservation confirmée", order, qrCodeImage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
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
      return res.status(403).json({ message: "Cette commande n'appartient pas à votre commerce" });
    }

    if (order.status === "COMPLETED") {
      return res.status(400).json({ message: "Cette commande a déjà été récupérée" });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { status: "COMPLETED" },
    });

    res.json({ message: "Commande validée avec succès", order: updatedOrder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};