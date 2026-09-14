import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { prisma } from "../lib/prisma";

/** Must follow authenticate. Request bodies and stale JWT role claims are not authority. */
export const requireMerchant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ message: "Non autorisé" });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
    if (user?.role !== "MERCHANT") {
      return res.status(403).json({ message: "auth.merchantRequired" });
    }
    next();
  } catch {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};
