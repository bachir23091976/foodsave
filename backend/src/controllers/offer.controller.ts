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

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const getNearbyOffers = async (req: AuthRequest, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "lat et lng requis" });
    }

    const offers = await prisma.offer.findMany({
      where: { quantity: { gt: 0 } },
      include: { merchant: true },
    });

    const offersWithDistance = offers
      .filter((offer) => offer.merchant.latitude && offer.merchant.longitude)
      .map((offer) => ({
        ...offer,
        distanceKm: distanceKm(lat, lng, offer.merchant.latitude as number, offer.merchant.longitude as number),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({ offers: offersWithDistance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};