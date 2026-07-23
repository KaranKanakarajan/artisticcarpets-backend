import Razorpay from "razorpay";
import crypto from "crypto";
import { successResponse, errorResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

// @desc    Create a Razorpay Order
// @route   POST /api/payment/razorpay/order
// @access  Private
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { amount, currency = "USD" } = req.body;

  if (!amount) {
    return errorResponse(res, "Please provide amount", 400);
  }

  // Initialize razorpay instance
  // Keys should ideally be from process.env, but for demo we can handle gracefully if not set
  const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "YOUR_RAZORPAY_KEY_ID_HERE",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "YOUR_RAZORPAY_KEY_SECRET_HERE",
  });

  const options = {
    amount: Math.round(amount * 100), // amount in smallest currency unit
    currency,
    receipt: `rcpt_${Math.floor(Math.random() * 10000)}`,
  };

  try {
    const order = await instance.orders.create(options);
    return successResponse(res, order, "Order created successfully");
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    return errorResponse(res, "Failed to create Razorpay order", 500);
  }
});

// @desc    Verify Razorpay Payment
// @route   POST /api/payment/razorpay/verify
// @access  Private
export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return errorResponse(res, "Missing payment verification parameters", 400);
  }

  const secret = process.env.RAZORPAY_KEY_SECRET || "YOUR_RAZORPAY_KEY_SECRET_HERE";

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  if (isAuthentic) {
    // Payment is verified
    // In a real app, you would save the order to the database here
    return successResponse(res, { verified: true }, "Payment verified successfully");
  } else {
    return errorResponse(res, "Payment verification failed", 400);
  }
});
