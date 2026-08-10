import { Router } from "express";
import multer from "multer";
import { uploadImage } from "../controllers/upload.controller";
import { authenticate } from "../middleware/auth.middleware";

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

router.post("/image", authenticate, upload.single("image"), uploadImage);

export default router;