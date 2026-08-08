import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const [userCount, merchantCount, offerCount, orderCount] = await Promise.all([
      prisma.user.count(),
      prisma.merchant.count(),
      prisma.offer.count(),
      prisma.order.count(),
    ]);

    res.json({
      stats: { userCount, merchantCount, offerCount, orderCount },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getPendingMerchants = async (req: AuthRequest, res: Response) => {
  try {
    const merchants = await prisma.merchant.findMany({
      where: { isApproved: false },
      include: { owner: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ merchants });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const approveMerchant = async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId } = req.body;

    if (!merchantId) {
      return res.status(400).json({ message: "merchantId manquant" });
    }

    const merchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: { isApproved: true },
    });

    res.json({ message: "Commerce approuvé", merchant });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};