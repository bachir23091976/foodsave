import { Router } from "express";
import { authenticateCron } from "../middleware/cron-auth.middleware";
import { reconcileNoShowBatch } from "../controllers/no-show-cron.controller";

const router = Router();
router.post("/reconcile-no-show", authenticateCron, reconcileNoShowBatch);
export default router;
