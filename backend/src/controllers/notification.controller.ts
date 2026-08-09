import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const createNotification = async (userId: string, message: string) => {
  return prisma.notification.create({
    data: { userId, message },
  });
};

export const getMyNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    res.json({ notifications });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { notificationId } = req.body;

    if (!notificationId) {
      return res.status(400).json({ message: "notificationId manquant" });
    }

    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });

    if (!notification || notification.userId !== userId) {
      return res.status(404).json({ message: "Notification introuvable" });
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.json({ notification: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};