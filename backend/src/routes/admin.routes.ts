import { Router, Response, NextFunction } from "express";
import { getDashboardStats, getPendingMerchants, approveMerchant } from "../controllers/admin.controller";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.role !== "ADMIN") {
    return res.status(403).json({ message: "Accès réservé aux administrateurs" });
  }
  next();
};

router.get("/stats", authenticate, requireAdmin, getDashboardStats);
router.get("/merchants/pending", authenticate, requireAdmin, getPendingMerchants);
router.post("/merchants/approve", authenticate, requireAdmin, approveMerchant);

export default router;