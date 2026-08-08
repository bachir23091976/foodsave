import { Router } from "express";
import { createRestaurantProfile, getMyRestaurant } from "../controllers/restaurant.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createRestaurantProfile);
router.get("/me", authenticate, getMyRestaurant);

export default router;
