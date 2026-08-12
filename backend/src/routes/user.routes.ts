import { Router } from "express";
import { updateDietaryPreferences, getMyPreferences, getReferralInfo } from "../controllers/user.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/dietary-preferences", authenticate, updateDietaryPreferences);
router.get("/dietary-preferences", authenticate, getMyPreferences);
router.get("/referral", authenticate, getReferralInfo);
export default router;