import express from "express";
import {
  reportDamage,
  getDamagedItems,
  updateDamageStatus,
  editDamageReport,
  deleteDamageRecord,
  getDamageStats
} from "../controllers/damage.controller.js";
import { protect, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes require authentication and admin access
router.use(protect);
router.use(adminOnly);

router.post("/", reportDamage);
router.get("/", getDamagedItems);
router.get("/stats", getDamageStats);

router.patch("/:id/status", updateDamageStatus);
router.patch("/:id", editDamageReport);
router.delete("/:id", deleteDamageRecord);

export default router;
