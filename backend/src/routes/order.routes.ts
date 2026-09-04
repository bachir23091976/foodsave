import { Router } from "express";
import { createOrder, confirmOrder, getMyOrders, getMerchantOrders, validatePickup, cancelOrder, stripeWebhook } from "../controllers/order.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// No authenticate here: this is called by Stripe's servers, not a logged-in
// user -- stripeWebhook verifies the request is genuinely from Stripe via
// the signature check instead. The raw-body parsing this route depends on
// is registered in index.ts, ahead of the global express.json().
router.post("/webhook", stripeWebhook);

router.post("/", authenticate, createOrder);
router.post("/confirm", authenticate, confirmOrder);
router.get("/mine", authenticate, getMyOrders);
router.post("/cancel", authenticate, cancelOrder);
router.get("/merchant", authenticate, getMerchantOrders);
router.post("/validate", authenticate, validatePickup);

export default router;