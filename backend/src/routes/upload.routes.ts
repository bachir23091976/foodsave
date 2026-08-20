import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { uploadImage } from "../controllers/upload.controller";
import { authenticate } from "../middleware/auth.middleware";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — prevents unbounded memory use per upload
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

// multer reports oversize/invalid-type files via next(err) rather than
// throwing inside the controller; without this wrapper Express's default
// error handler would return a generic non-JSON error to the frontend.
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("image")(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image trop volumineuse (5 Mo maximum)" });
    }
    if (err.message === "INVALID_FILE_TYPE") {
      return res.status(400).json({ message: "Le fichier doit etre une image" });
    }
    console.error(err);
    return res.status(400).json({ message: "Erreur lors du televersement du fichier" });
  });
}

const router = Router();

router.post("/image", authenticate, handleUpload, uploadImage);

export default router;