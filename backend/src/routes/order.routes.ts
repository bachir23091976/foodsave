import { Router } from "express";
import { createOrder, getMyOrders, validatePickup } from "../controllers/order.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createOrder);
router.get("/mine", authenticate, getMyOrders);
router.post("/validate", authenticate, validatePickup);

export default router;