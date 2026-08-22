import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";
import { createNotification } from "./notification.controller";

const NEARBY_RADIUS_KM = 5;

const FORBIDDEN_KEYWORDS = [
  "biere",
  "vin",
  "alcool",
  "alcohol",
  "beer",
  "wine",
  "whisky",
  "whiskey",
  "vodka",
  "rhum",
  "rum",
  "gin",
  "champagne",
  "cidre",
  "spiritueux",
  "liqueur",
  "cocktail",
  "cognac",
  "tequila",
  "porto",
  "porc",
  "pork",
  "jambon",
  "ham",
  "bacon",
  "lardons",
  "prosciutto",
  "chorizo",
  "pepperoni",
  "salami",
];

function containsForbiddenContent(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_KEYWORDS.some((word) => lower.includes(word));
}

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

async function notifyNearbyUsers(merchantLat: number, merchantLng: number, merchantName: string, offerTitle: string) {
  try {
    const allLocations = await prisma.savedLocation.findMany();

    const nearbyUserIds = new Set<string>();

    for (const loc of allLocations) {
      const dist = distanceKm(merchantLat, merchantLng, loc.latitude, loc.longitude);
      if (dist <= NEARBY_RADIUS_KM) {
        nearbyUserIds.add(loc.userId);
      }
    }

    for (const userId of nearbyUserIds) {
      await createNotification(userId, "Nouvelle offre pres de chez vous : " + offerTitle + " chez " + merchantName);
    }
  } catch (error) {
    console.error("Erreur notification proximite:", error);
  }
}

export const createOffer = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { title, description, imageUrl, originalPrice, discountedPrice, quantity, pickupStart, pickupEnd } = req.body;

    if (!title || !originalPrice || !discountedPrice || !quantity || !pickupStart || !pickupEnd) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    if (containsForbiddenContent(title) || containsForbiddenContent(description || "")) {
      return res.status(400).json({
        message: "Les produits alcoolises ou a base de porc ne sont pas autorises sur FoodSave",
      });
    }

    const originalPriceNum = Number(originalPrice);
    const discountedPriceNum = Number(discountedPrice);
    const quantityNum = Number(quantity);
    const pickupStartDate = new Date(pickupStart);
    const pickupEndDate = new Date(pickupEnd);

    if (
      !Number.isFinite(originalPriceNum) || originalPriceNum <= 0 ||
      !Number.isFinite(discountedPriceNum) || discountedPriceNum <= 0 ||
      discountedPriceNum > originalPriceNum
    ) {
      return res.status(400).json({ message: "Prix invalides" });
    }

    if (!Number.isInteger(quantityNum) || quantityNum <= 0 || quantityNum > 1000) {
     return res.status(400).json({ message: "La quantite doit etre comprise entre 1 et 1000" });
    }

    if (isNaN(pickupStartDate.getTime()) || isNaN(pickupEndDate.getTime()) || pickupEndDate <= pickupStartDate) {
      return res.status(400).json({ message: "Fenetre de recuperation invalide" });
    }

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouve pour ce compte" });
    }

    const offer = await prisma.offer.create({
      data: {
        title,
        description,
        imageUrl: imageUrl || null,
        originalPrice: originalPriceNum,
        discountedPrice: discountedPriceNum,
        quantity: quantityNum,
        pickupStart: pickupStartDate,
        pickupEnd: pickupEndDate,
        merchantId: merchant.id,
      },
    });

    if (merchant.latitude && merchant.longitude) {
      notifyNearbyUsers(merchant.latitude, merchant.longitude, merchant.name, offer.title);
    }

    res.status(201).json({ message: "Offre creee avec succes", offer });
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
      return res.status(404).json({ message: "Aucun commerce trouve pour ce compte" });
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

export const deactivateOffer = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const id = String(req.params.id);

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouve pour ce compte" });
    }

    const offer = await prisma.offer.findUnique({ where: { id } });
    if (!offer) {
      return res.status(404).json({ message: "Offre introuvable" });
    }

    if (offer.merchantId !== merchant.id) {
      return res.status(403).json({ message: "Cette offre n'appartient pas a votre commerce" });
    }

    // Deactivation only ever sets quantity to the fixed sentinel value 0 (the
    // same value getAllOffers/getNearbyOffers already filter out with
    // `quantity: { gt: 0 }`) — it never touches order history, so existing
    // orders/pickup codes for this offer remain valid and unaffected.
    const updatedOffer = await prisma.offer.update({
      where: { id: offer.id },
      data: { quantity: 0 },
    });

    res.json({ message: "Offre desactivee avec succes", offer: updatedOffer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

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
