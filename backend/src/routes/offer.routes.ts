import { requireMerchant } from "../middleware/role.middleware";
import { Router } from "express";
import { createOffer, getMyOffers, getAllOffers, getNearbyOffers, deactivateOffer } from "../controllers/offer.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();


router.post("/", authenticate, requireMerchant, createOffer);
router.get("/mine", authenticate, requireMerchant, getMyOffers);
router.get("/nearby", getNearbyOffers);
router.get("/", getAllOffers);
router.patch("/:id/deactivate", authenticate, requireMerchant, deactivateOffer);

export default router;