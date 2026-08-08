import { Response } from "express";
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

    res.status(201).json({ message: "Réservation confirmée", order });
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