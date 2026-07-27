import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variant: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, required: true },
    image: { type: String },
    sku: { type: String },
    size: { type: String },
    material: { type: String },
    color: { type: String },
    shape: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
  },
  { _id: true }
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    phone: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String },
  },
  { _id: false }
);

const timelineEventSchema = new mongoose.Schema(
  {
    status: { type: String },
    message: { type: String },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["stripe", "razorpay", "cod", "bank_transfer", "upi"],
      default: "stripe",
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded", "partially_refunded"],
      default: "pending",
    },
    transactionId: { type: String },
    gatewayOrderId: { type: String },
    gatewayPaymentId: { type: String },
    paidAt: { type: Date },
    amount: { type: Number },
    currency: { type: String, default: "INR" },
    receiptUrl: { type: String },
  },
  { _id: false }
);

const shippingSchema = new mongoose.Schema(
  {
    carrier: { type: String },
    trackingNumber: { type: String },
    trackingUrl: { type: String },
    method: { type: String },
    estimatedDelivery: { type: Date },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    shippingCost: { type: Number, default: 0 },
    labelUrl: { type: String },
  },
  { _id: false }
);

const refundSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    refundWindow: { type: Number, default: 0 },
    refundEligibleUntil: { type: Date },
    status: {
      type: String,
      enum: ["None", "Pending", "Approved", "Rejected", "Refunded"],
      default: "None",
    },
    requestedAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    completedAt: { type: Date },
    reason: { type: String },
    comment: { type: String },
    images: [{ type: String }],
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Snapshot of customer info at time of order
    customerSnapshot: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
    },

    items: [orderItemSchema],

    // Addresses
    shippingAddress: addressSnapshotSchema,
    billingAddress: addressSnapshotSchema,

    // Coupon
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    couponCode: { type: String },
    couponDiscount: { type: Number, default: 0 },

    // Pricing breakdown
    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    // Status
    inventoryDeducted: { type: Boolean, default: false },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "returned",
        "refunded",
      ],
      default: "pending",
    },

    // Payment & Shipping
    payment: paymentSchema,
    shipping: shippingSchema,

    // Refunds
    refund: {
      type: refundSchema,
      default: () => ({ status: "None" }),
    },

    // Timeline / history
    timeline: [timelineEventSchema],

    // Internal notes (admin only)
    internalNotes: [
      {
        note: { type: String },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    // Flags
    isGift: { type: Boolean, default: false },
    giftMessage: { type: String },
    source: {
      type: String,
      enum: ["website", "mobile", "admin", "import"],
      default: "website",
    },

    // Invoice
    invoiceNumber: { type: String },
    invoiceUrl: { type: String },

    // Tax invoice
    gstNumber: { type: String },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate order number
orderSchema.pre("save", async function (next) {
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const random = Math.floor(10000 + Math.random() * 90000);
    this.orderNumber = `AC${year}${month}${random}`;
  }
  next();
});

// Virtual: total items
orderSchema.virtual("itemCount").get(function () {
  if (!this.items) return 0;
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ "payment.status": 1 });
orderSchema.index({ "shipping.trackingNumber": 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
