import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const addFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { merchantId } = req.body;

    if (!merchantId) {
      return res.status(400).json({ message: "merchantId manquant" });
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_merchantId: { userId: userId as string, merchantId } },
    });

    if (existing) {
      return res.status(400).json({ message: "Ce commerce est déjà dans vos favoris" });
    }

    const favorite = await prisma.favorite.create({
      data: { userId: userId as string, merchantId },
    });

    res.status(201).json({ message: "Ajouté aux favoris", favorite });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const removeFavorite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { merchantId } = req.body;

    await prisma.favorite.delete({
      where: { userId_merchantId: { userId: userId as string, merchantId } },
    });

    res.json({ message: "Retiré des favoris" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMyFavorites = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: { merchant: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ favorites });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};