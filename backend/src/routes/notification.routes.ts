import { Router } from "express";
import { getMyNotifications, markAsRead } from "../controllers/notification.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, getMyNotifications);
router.post("/read", authenticate, markAsRead);

export default router;