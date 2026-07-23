import express from "express";
import {
  createComplaint,
  getUserComplaints,
  getAllComplaints,
  updateComplaintStatus,
} from "../controllers/complaint.controller.js";
import { protect, adminOnly, optionalAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", optionalAuth, createComplaint);
router.get("/my-complaints", optionalAuth, getUserComplaints);
router.get("/", protect, adminOnly, getAllComplaints);
router.put("/:id", protect, adminOnly, updateComplaintStatus);

export default router;
