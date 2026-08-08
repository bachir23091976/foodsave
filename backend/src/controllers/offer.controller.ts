import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const createOffer = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { title, description, imageUrl, originalPrice, discountedPrice, quantity, pickupStart, pickupEnd } = req.body;

    if (!title || !originalPrice || !discountedPrice || !quantity || !pickupStart || !pickupEnd) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouvé pour ce compte" });
    }

    const offer = await prisma.offer.create({
      data: {
        title,
        description,
        originalPrice,
        discountedPrice,
        quantity,
        pickupStart: new Date(pickupStart),
        pickupEnd: new Date(pickupEnd),
        merchantId: merchant.id,
      },
    });

    res.status(201).json({ message: "Offre créée avec succès", offer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMyOffers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouvé pour ce compte" });
    }

    const offers = await prisma.offer.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ offers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getAllOffers = async (req: AuthRequest, res: Response) => {
  try {
    const offers = await prisma.offer.findMany({
      where: { quantity: { gt: 0 } },
      include: { merchant: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ offers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};