import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

const ORDERS_NEEDED = 5;
const DISCOUNT_PERCENT = 15;

export const checkAndCreateReward = async (userId: string) => {
  const completedCount = await prisma.order.count({
    where: { userId, status: "COMPLETED" },
  });

  if (completedCount > 0 && completedCount % ORDERS_NEEDED === 0) {
    const unusedReward = await prisma.loyaltyReward.findFirst({
      where: { userId, isUsed: false },
    });

    if (!unusedReward) {
      await prisma.loyaltyReward.create({
        data: {
          userId,
          discountCad: DISCOUNT_PERCENT,
        },
      });
    }
  }
};

export const getMyRewards = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const rewards = await prisma.loyaltyReward.findMany({
      where: { userId, isUsed: false },
      orderBy: { createdAt: "desc" },
    });

    const completedCount = await prisma.order.count({
      where: { userId, status: "COMPLETED" },
    });

    const ordersUntilNextReward = ORDERS_NEEDED - (completedCount % ORDERS_NEEDED);

    res.json({ rewards, completedCount, ordersUntilNextReward });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};