import { Router } from "express";
import { createOrder, getMyOrders } from "../controllers/order.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createOrder);
router.get("/mine", authenticate, getMyOrders);

export default router;