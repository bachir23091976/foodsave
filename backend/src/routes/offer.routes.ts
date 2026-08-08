import { Router } from "express";
import { createOffer, getMyOffers, getAllOffers } from "../controllers/offer.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createOffer);
router.get("/mine", authenticate, getMyOffers);
router.get("/", getAllOffers);

export default router;