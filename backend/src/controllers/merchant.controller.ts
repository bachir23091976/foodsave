import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

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