import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const createRestaurantProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { name, description, address, city, province, postalCode, phone } = req.body;

    if (!name || !address || !city || !province || !postalCode) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const existing = await prisma.restaurant.findUnique({ where: { ownerId: userId } });
    if (existing) {
      return res.status(400).json({ message: "Ce compte a déjà un restaurant" });
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        description,
        address,
        city,
        province,
        postalCode,
        phone,
        ownerId: userId as string,
      },
    });

    res.status(201).json({ message: "Restaurant créé avec succès", restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMyRestaurant = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const restaurant = await prisma.restaurant.findUnique({ where: { ownerId: userId } });

    if (!restaurant) {
      return res.status(404).json({ message: "Aucun restaurant trouvé" });
    }

    res.json({ restaurant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};