import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import Coupon from "../models/coupon.model.js";
import InventoryMovement from "../models/inventory.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  parsePagination,
  buildPagination,
} from "../utils/apiResponse.js";
import { sendOrderConfirmationEmail, sendOrderStatusEmail } from "../services/email.service.js";
import { createAuditLog } from "../utils/auditLog.utils.js";

// ─── Create Order ─────────────────────────────────────────────────────────────

export const createOrder = asyncHandler(async (req, res) => {
  const {
    items, shippingAddress, billingAddress,
    couponCode, paymentMethod = "cod",
    paymentStatus = "pending", transactionId,
    isGift = false, giftMessage,
  } = req.body;

  if (!items?.length) return errorResponse(res, "Order must have at least one item.", 400);

  // Fetch products and validate stock
  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product || product.status !== "active") {
      return errorResponse(res, `Product not available: {item.productId}`, 400);
    }
    if (product.stock < item.quantity) {
      return errorResponse(res, `Insufficient stock for: {product.name}`, 400);
    }

    const unitPrice = product.discountPrice || product.price;
    const totalPrice = unitPrice * item.quantity;
    subtotal += totalPrice;

    orderItems.push({
      product: product._id,
      name: product.title,
      image: product.thumbnail?.path || product.images?.[0]?.path || null,
      sku: product.sku,
      size: item.size,
      material: item.material,
      color: item.color,
      shape: item.shape,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
    });
  }

  // Apply coupon
  let couponDiscount = 0;
  let couponDoc = null;

  if (couponCode) {
    couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });

    if (!couponDoc) return errorResponse(res, "Invalid coupon code.", 400);
    if (couponDoc.expiresAt && new Date() > couponDoc.expiresAt) {
      return errorResponse(res, "Coupon has expired.", 400);
    }
    if (couponDoc.usageLimit && couponDoc.usedCount >= couponDoc.usageLimit) {
      return errorResponse(res, "Coupon usage limit reached.", 400);
    }
    if (subtotal < couponDoc.minimumOrderAmount) {
      return errorResponse(res, `Minimum order amount ₹{couponDoc.minimumOrderAmount} required for this coupon.`, 400);
    }

    // Check per-user usage
    const userUsage = couponDoc.usedBy.filter(
      (u) => u.user.toString() === req.user._id.toString()
    ).length;
    if (userUsage >= (couponDoc.usageLimitPerUser || 1)) {
      return errorResponse(res, "You have already used this coupon.", 400);
    }

    if (couponDoc.type === "percentage") {
      couponDiscount = (subtotal * couponDoc.value) / 100;
      if (couponDoc.maxDiscount) couponDiscount = Math.min(couponDiscount, couponDoc.maxDiscount);
    } else if (couponDoc.type === "fixed") {
      couponDiscount = Math.min(couponDoc.value, subtotal);
    }
  }

  const shippingCost = 0; // Simplified for prototype: subtotal - couponDiscount > 5000 ? 0 : 199; 
  const taxRate = 0; // Simplified for prototype: 18% GST
  const taxableAmount = subtotal - couponDiscount;
  const taxAmount = Math.round(taxableAmount * taxRate);
  const total = taxableAmount + shippingCost + taxAmount;

  // Get user details (fallback to request body then guest if not authenticated)
  const customerId = req.user?._id || "000000000000000000000000"; // Dummy ID for guest
  const customerName = req.user?.fullName || req.body.customerName || "Guest User";
  const customerEmail = req.user?.email || req.body.customerEmail || "guest@example.com";
  const customerPhone = req.user?.phone || req.body.customerPhone || "0000000000";

  // Extract refund policy from the first product in the cart
  let orderRefund = { status: "None" };
  if (items.length > 0) {
    const firstProduct = await Product.findById(items[0].productId);
    if (firstProduct && firstProduct.refundPolicy) {
      orderRefund = {
        enabled: firstProduct.refundPolicy.enabled || false,
        refundWindow: firstProduct.refundPolicy.refundWindow || 0,
        status: "None"
      };
    }
  }

  // Create order
  const order = await Order.create({
    customer: customerId,
    customerSnapshot: {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
    },
    items: orderItems,
    shippingAddress,
    billingAddress: billingAddress || shippingAddress,
    coupon: couponDoc?._id,
    couponCode: couponDoc?.code,
    couponDiscount,
    subtotal,
    shippingCost,
    taxAmount,
    taxRate,
    total,
    payment: { method: paymentMethod, status: paymentStatus, transactionId },
    isGift,
    giftMessage,
    refund: orderRefund,
    timeline: [{ status: "pending", message: "Order placed successfully." }],
  });

  // Deduct stock and log inventory
  for (const item of orderItems) {
    const prev = await Product.findById(item.product);
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity, soldCount: item.quantity },
    });
    await InventoryMovement.create({
      product: item.product,
      sku: item.sku,
      type: "sale",
      quantity: -item.quantity,
      previousStock: prev.stock,
      newStock: prev.stock - item.quantity,
      reference: order.orderNumber,
      referenceId: order._id,
      performedBy: req.user ? req.user._id : customerId,
    });
  }

  // Mark coupon as used
  if (couponDoc) {
    await Coupon.findByIdAndUpdate(couponDoc._id, {
      $inc: { usedCount: 1 },
      $push: { usedBy: { user: req.user._id, orderId: order._id } },
    });
  }

  // Update customer stats (only if authenticated)
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { totalOrders: 1, totalSpent: total },
      lastOrderAt: new Date(),
    });
  }

  // Send confirmation email
  if (req.user) {
    sendOrderConfirmationEmail(req.user, order).catch(console.error);
  }

  if (req.user) {
    await createAuditLog({
      user: req.user, action: "CREATE_ORDER", module: "Order",
      targetId: order._id, description: `Placed new order ${order.orderNumber}`
    });
  }

  return successResponse(res, { order }, "Order placed successfully.", 201);
});

// ─── Get My Orders (Customer) ─────────────────────────────────────────────────

export const getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { status } = req.query;

  const filter = { customer: req.user._id };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select("orderNumber items total status payment.status shipping.trackingNumber createdAt")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return paginatedResponse(res, orders, buildPagination(page, limit, total));
});

// ─── Get Order Detail ─────────────────────────────────────────────────────────

export const getOrderById = asyncHandler(async (req, res) => {
  const query = { _id: req.params.id };
  // Customers can only see their own orders
  if (req.user.role === "customer") query.customer = req.user._id;

  const order = await Order.findOne(query)
    .populate("customer", "firstName lastName email phone")
    .populate("coupon", "code type value")
    .populate("items.product", "name slug mainImage")
    .populate("timeline.updatedBy", "firstName lastName")
    .populate("internalNotes.addedBy", "firstName lastName");

  if (!order) return errorResponse(res, "Order not found.", 404);
  return successResponse(res, { order }, "Order fetched.");
});

// ─── Admin: List All Orders ───────────────────────────────────────────────────

export const getOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const {
    search, status, paymentStatus,
    startDate, endDate, sort = "-createdAt",
  } = req.query;

  const filter = {};

  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { "customerSnapshot.name":  { $regex: search, $options: "i" } },
      { "customerSnapshot.email": { $regex: search, $options: "i" } },
    ];
  }
  if (status)        filter.status           = status;
  if (paymentStatus) filter["payment.status"] = paymentStatus;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate)   filter.createdAt.$lte = new Date(endDate);
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("customer", "firstName lastName email")
      .select("orderNumber customerSnapshot total status payment shipping createdAt couponDiscount")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return paginatedResponse(res, orders, buildPagination(page, limit, total));
});

// ─── Update Order Status ──────────────────────────────────────────────────────

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note, trackingNumber, carrier } = req.body;

  const order = await Order.findById(req.params.id);
  if (!order) return errorResponse(res, "Order not found.", 404);

  const validTransitions = {
    pending:          ["confirmed", "cancelled"],
    confirmed:        ["processing", "cancelled"],
    processing:       ["shipped", "cancelled"],
    shipped:          ["out_for_delivery", "returned"],
    out_for_delivery: ["delivered", "returned"],
    delivered:        ["returned"],
    cancelled:        [],
    returned:         ["refunded"],
    refunded:         [],
  };

  if (!validTransitions[order.status]?.includes(status)) {
    return errorResponse(res, `Cannot transition from "${order.status}" to "${status}".`, 400);
  }

  order.status = status;

  // Update shipping info if shipping
  if (status === "shipped" && (trackingNumber || carrier)) {
    order.shipping = {
      ...order.shipping?.toObject?.() || {},
      trackingNumber: trackingNumber || order.shipping?.trackingNumber,
      carrier: carrier || order.shipping?.carrier,
      shippedAt: new Date(),
    };
  }

  if (status === "delivered") {
    order.shipping = { ...(order.shipping?.toObject?.() || {}), deliveredAt: new Date() };
    order.payment = { ...(order.payment?.toObject?.() || {}), status: "paid", paidAt: new Date() };

    // Calculate refund eligibility date
    if (order.refund && order.refund.enabled && order.refund.refundWindow > 0) {
      const eligibleUntil = new Date();
      eligibleUntil.setDate(eligibleUntil.getDate() + order.refund.refundWindow);
      order.refund.refundEligibleUntil = eligibleUntil;
    }
  }

  order.timeline.push({
    status,
    message: note || `Order ${status.replace(/_/g, " ")}.`,
    updatedBy: req.user._id,
  });

  // Inventory deduction logic
  if ((status === "processing" || order.payment?.status === "paid") && !order.inventoryDeducted) {
    for (const item of order.items) {
      if (item.product) {
        const prod = await Product.findById(item.product);
        if (prod) {
          const prevStock = prod.stock;
          prod.stock = Math.max(0, prod.stock - item.quantity);
          await prod.save();
          await InventoryMovement.create({
            product: prod._id,
            sku: prod.sku,
            type: "sale",
            quantity: -item.quantity,
            previousStock: prevStock,
            newStock: prod.stock,
            reference: order.orderNumber,
            referenceId: order._id,
            notes: `Deducted for Order ${order.orderNumber}`,
            performedBy: req.user._id,
          });
        }
      }
    }
    order.inventoryDeducted = true;
  }

  // Inventory restoration on cancellation
  if (status === "cancelled" && order.inventoryDeducted) {
    for (const item of order.items) {
      if (item.product) {
        const prod = await Product.findById(item.product);
        if (prod) {
          const prevStock = prod.stock;
          prod.stock += item.quantity;
          await prod.save();
          await InventoryMovement.create({
            product: prod._id,
            sku: prod.sku,
            type: "return",
            quantity: item.quantity,
            previousStock: prevStock,
            newStock: prod.stock,
            reference: order.orderNumber,
            referenceId: order._id,
            notes: `Restored from Cancelled Order ${order.orderNumber}`,
            performedBy: req.user._id,
          });
        }
      }
    }
    order.inventoryDeducted = false;
  }

  await order.save();

  // Notify customer
  const customer = await User.findById(order.customer);
  if (customer) sendOrderStatusEmail(customer, order).catch(console.error);

  await createAuditLog({
    user: req.user, action: "UPDATE_ORDER_STATUS", module: "Order",
    targetId: order._id, targetName: order.orderNumber,
    changes: { status }, req,
  });

  return successResponse(res, { order }, "Order status updated.");
});

// ─── Add Internal Note ────────────────────────────────────────────────────────

export const addInternalNote = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return errorResponse(res, "Order not found.", 404);

  order.internalNotes.push({ note, addedBy: req.user._id });
  await order.save();

  return successResponse(res, { internalNotes: order.internalNotes }, "Note added.");
});


// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getOrderStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    todayOrders,
    monthOrders,
    pendingOrders,
    completedOrders,
    cancelledOrders,
    returnedOrders,
    todayRevenue,
    monthRevenue,
    avgOrderValue,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.countDocuments({ createdAt: { $gte: monthStart } }),
    Order.countDocuments({ status: "pending" }),
    Order.countDocuments({ status: "delivered" }),
    Order.countDocuments({ status: "cancelled" }),
    Order.countDocuments({ status: { $in: ["returned", "refunded"] } }),
    Order.aggregate([
      { $match: { createdAt: { $gte: today }, "payment.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: monthStart }, "payment.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Order.aggregate([
      { $match: { "payment.status": "paid" } },
      { $group: { _id: null, avg: { $avg: "$total" } } },
    ]),
  ]);

  return successResponse(res, {
    stats: {
      todayOrders,
      monthOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      returnedOrders,
      todayRevenue:  todayRevenue[0]?.total  || 0,
      monthRevenue:  monthRevenue[0]?.total  || 0,
      avgOrderValue: Math.round(avgOrderValue[0]?.avg || 0),
    },
  }, "Order stats fetched.");
});

// ─── Revenue Chart (last 12 months) ──────────────────────────────────────────

export const getRevenueChart = asyncHandler(async (req, res) => {
  const months = parseInt(req.query.months) || 12;
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months + 1);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  const data = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        "payment.status": "paid",
      },
    },
    {
      $group: {
        _id: {
          year:  { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        revenue: { $sum: "$total" },
        orders:  { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return successResponse(res, { chart: data }, "Revenue chart fetched.");
});
