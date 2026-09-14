import { Router } from "express";
import { register, login } from "../controllers/auth.controller";
import { authLimiter, googleAuthLimiter } from "../middleware/rateLimit.middleware";
import { googleStart, googleAuthorize, googleCallback, googleComplete } from "../controllers/google-auth.controller";

const router = Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/google/start", googleAuthLimiter, googleStart);
router.get("/google/authorize", googleAuthLimiter, googleAuthorize);
router.get("/google/callback", googleAuthLimiter, googleCallback);
router.post("/google/complete", googleAuthLimiter, googleComplete);

export default router;
