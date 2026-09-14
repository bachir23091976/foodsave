import { requireMerchant } from "../middleware/role.middleware";
import { Router } from "express";
import { createMerchantProfile, getMyMerchant, connectStripe, getStripeStatus, getMySales } from "../controllers/merchant.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();


router.post("/", authenticate, requireMerchant, createMerchantProfile);
router.get("/me", authenticate, requireMerchant, getMyMerchant);
router.post("/connect-stripe", authenticate, requireMerchant, connectStripe);
router.get("/stripe-status", authenticate, requireMerchant, getStripeStatus);
router.get("/sales", authenticate, requireMerchant, getMySales);

export default router;