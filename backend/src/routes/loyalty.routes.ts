import { Router } from "express";
import { getMyRewards } from "../controllers/loyalty.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/", authenticate, getMyRewards);

export default router;