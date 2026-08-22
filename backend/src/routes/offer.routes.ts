import { Router } from "express";
import { createOffer, getMyOffers, getAllOffers, getNearbyOffers, deactivateOffer } from "../controllers/offer.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createOffer);
router.get("/mine", authenticate, getMyOffers);
router.get("/nearby", getNearbyOffers);
router.get("/", getAllOffers);
router.patch("/:id/deactivate", authenticate, deactivateOffer);

export default router;