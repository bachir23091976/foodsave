import { Router } from "express";
import { addFavorite, removeFavorite, getMyFavorites } from "../controllers/favorite.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, addFavorite);
router.post("/remove", authenticate, removeFavorite);
router.get("/", authenticate, getMyFavorites);

export default router;