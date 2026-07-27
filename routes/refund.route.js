import express from "express";
import { protect, adminOnly } from "../middleware/auth.middleware.js";
import {
  requestRefund,
  getRefunds,
  getRefundById,
  updateRefundStatus,
  getRefundStats
} from "../controllers/refund.controller.js";

const router = express.Router();

// ─── Admin Routes ────────────────────────────────────────────────────────────
router.get("/stats", protect, adminOnly, getRefundStats);
router.get("/", protect, adminOnly, getRefunds);
router.patch("/:id/status", protect, adminOnly, updateRefundStatus);

// ─── User Routes ─────────────────────────────────────────────────────────────
router.post("/:id", protect, requestRefund);
router.get("/:id", protect, getRefundById);

export default router;
