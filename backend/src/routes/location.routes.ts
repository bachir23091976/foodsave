import { Router } from "express";
import { createSavedLocation, getMySavedLocations, deleteSavedLocation } from "../controllers/location.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, createSavedLocation);
router.get("/", authenticate, getMySavedLocations);
router.post("/delete", authenticate, deleteSavedLocation);

export default router;