import { Router } from "express";
import { createMerchantProfile, getMyMerchant, connectStripe, getStripeStatus, getMySales } from "../controllers/merchant.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createMerchantProfile);
router.get("/me", authenticate, getMyMerchant);
router.post("/connect-stripe", authenticate, connectStripe);
router.get("/stripe-status", authenticate, getStripeStatus);
router.get("/sales", authenticate, getMySales);

export default router;