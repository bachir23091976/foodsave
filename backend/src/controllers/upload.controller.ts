import { Response } from "express";
import { cloudinary } from "../lib/cloudinary";
import { AuthRequest } from "../middleware/auth.middleware";

export const uploadImage = async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;

    if (!file) {
      return res.status(400).json({ message: "Aucune image fournie" });
    }

    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "foodsave-offers" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(file.buffer);
    });

    res.json({ imageUrl: uploadResult.secure_url });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Erreur lors du televersement", detail: error.message });
  }
};