import express from "express";
import { createRazorpayOrder, verifyRazorpayPayment } from "../controllers/payment.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/razorpay/order", protect, createRazorpayOrder);
router.post("/razorpay/verify", protect, verifyRazorpayPayment);

export default router;
