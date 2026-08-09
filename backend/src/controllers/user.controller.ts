import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const updateDietaryPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { dietaryPreferences } = req.body;

    if (!Array.isArray(dietaryPreferences)) {
      return res.status(400).json({ message: "dietaryPreferences doit être une liste" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { dietaryPreferences },
    });

    res.json({ message: "Préférences mises à jour", dietaryPreferences: user.dietaryPreferences });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMyPreferences = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dietaryPreferences: true },
    });

    res.json({ dietaryPreferences: user?.dietaryPreferences || [] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};