import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(`${address}, Canada`);
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

export const createSavedLocation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { label, address } = req.body;

    if (!label || !address) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const coords = await geocodeAddress(address);
    if (!coords) {
      return res.status(400).json({ message: "Adresse introuvable" });
    }

    const location = await prisma.savedLocation.create({
      data: {
        label,
        address,
        latitude: coords.lat,
        longitude: coords.lng,
        userId: userId as string,
      },
    });

    res.status(201).json({ message: "Adresse enregistrée avec succès", location });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getMySavedLocations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const locations = await prisma.savedLocation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ locations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const deleteSavedLocation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { locationId } = req.body;

    const location = await prisma.savedLocation.findUnique({ where: { id: locationId } });

    if (!location || location.userId !== userId) {
      return res.status(404).json({ message: "Adresse introuvable" });
    }

    await prisma.savedLocation.delete({ where: { id: locationId } });

    res.json({ message: "Adresse supprimée" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};