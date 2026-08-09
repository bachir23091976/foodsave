import { Response } from "express";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { AuthRequest } from "../middleware/auth.middleware";

async function geocodeAddress(address: string, city: string, province: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(`${address}, ${city}, ${province}, Canada`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

    const res = await fetch(url, {
      headers: { "User-Agent": "FoodSaveApp/1.0" },
    });

    const data = await res.json();

    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export const createMerchantProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { name, type, description, address, city, province, postalCode, phone } = req.body;

    if (!name || !address || !city || !province || !postalCode) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const existing = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (existing) {
      return res.status(400).json({ message: "Ce compte a déjà un commerce" });
    }

    const coords = await geocodeAddress(address, city, province);

    const merchant = await prisma.merchant.create({
      data: {
        name,
        type: type || "RESTAURANT",
        description,
        address,
        city,
        province,
        postalCode,
        phone,
        latitude: coords?.lat,
        longitude: coords?.lng,
        ownerId: userId as string,
      },
    });

    res.status(201).json({ message: "Commerce créé avec succès", merchant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMyMerchant = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });

    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouvé" });
    }

    res.json({ merchant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const connectStripe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const merchant = await prisma.merchant.findUnique({ where: { ownerId: userId } });
    if (!merchant) {
      return res.status(404).json({ message: "Aucun commerce trouvé" });
    }

    let stripeAccountId = merchant.stripeAccountId;

    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "CA",
        email: req.body.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      stripeAccountId = account.id;

      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { stripeAccountId },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: "http://localhost:3000/merchant/stripe-refresh",
      return_url: "http://localhost:3000/merchant/stripe-success",
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors de la connexion à Stripe", detail: error.message });
  }
};