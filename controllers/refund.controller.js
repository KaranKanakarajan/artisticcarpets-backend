import Order from "../models/order.model.js";
import Notification from "../models/notification.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import { successResponse, errorResponse, paginatedResponse, parsePagination, buildPagination } from "../utils/apiResponse.js";
import { createAuditLog } from "../utils/auditLog.utils.js";

// ─── Request Refund (User) ───────────────────────────────────────────────────
export const requestRefund = asyncHandler(async (req, res) => {
  const { reason, comment, images } = req.body;
  const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
  
  if (!order) return errorResponse(res, "Order not found.", 404);

  // Validate eligibility
  if (!order.refund?.enabled) {
    return errorResponse(res, "Refunds are not enabled for this order.", 400);
  }
  
  if (order.status !== "delivered") {
    return errorResponse(res, "Refund can only be requested for delivered orders.", 400);
  }
  
  if (order.refund.status !== "None") {
    return errorResponse(res, "A refund has already been requested for this order.", 400);
  }

  const now = new Date();
  if (order.refund.refundEligibleUntil && now > order.refund.refundEligibleUntil) {
    return errorResponse(res, "The refund window for this order has expired.", 400);
  }

  // Update refund object
  order.refund.status = "Pending";
  order.refund.requestedAt = now;
  order.refund.reason = reason;
  order.refund.comment = comment;
  order.refund.images = images || [];

  await order.save();

  // Create notification for admin
  await Notification.create({
    user: null, // Global or admin target
    title: "New Refund Request",
    message: `A new refund request has been submitted for order ${order.orderNumber}.`,
    type: "system",
    link: `/refunds/${order._id}`,
  });

  return successResponse(res, { order }, "Refund requested successfully.");
});

// ─── Get All Refunds (Admin) ─────────────────────────────────────────────────
export const getRefunds = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { search, status, sort = "-refund.requestedAt" } = req.query;

  const filter = { "refund.status": { $ne: "None" } };

  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { "customerSnapshot.name": { $regex: search, $options: "i" } }
    ];
  }
  
  if (status) {
    filter["refund.status"] = status;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("customer", "firstName lastName email")
      .select("orderNumber customerSnapshot total status refund items createdAt")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return paginatedResponse(res, orders, buildPagination(page, limit, total));
});

// ─── Get Refund Details (Admin/User) ─────────────────────────────────────────
export const getRefundById = asyncHandler(async (req, res) => {
  const query = { _id: req.params.id };
  if (req.user.role === "customer") query.customer = req.user._id;

  const order = await Order.findOne(query)
    .populate("customer", "firstName lastName email phone")
    .populate("items.product", "name slug mainImage thumbnail");

  if (!order || order.refund?.status === "None") {
    return errorResponse(res, "Refund request not found.", 404);
  }
  
  return successResponse(res, { order }, "Refund details fetched.");
});

// ─── Update Refund Status (Admin) ────────────────────────────────────────────
export const updateRefundStatus = asyncHandler(async (req, res) => {
  const { status } = req.body; // "Approved", "Rejected", "Refunded"
  const order = await Order.findById(req.params.id);
  
  if (!order || order.refund?.status === "None") {
    return errorResponse(res, "Refund request not found.", 404);
  }

  const validStatuses = ["Approved", "Rejected", "Refunded"];
  if (!validStatuses.includes(status)) {
    return errorResponse(res, "Invalid status.", 400);
  }

  const now = new Date();
  order.refund.status = status;

  if (status === "Approved") order.refund.approvedAt = now;
  if (status === "Rejected") order.refund.rejectedAt = now;
  if (status === "Refunded") {
    order.refund.completedAt = now;
    order.status = "refunded";
    order.payment.status = "refunded";
    order.timeline.push({
      status: "refunded",
      message: `Refund completed successfully.`,
      updatedBy: req.user._id,
    });
  }

  await order.save();

  // Audit log
  await createAuditLog({
    user: req.user, action: "UPDATE_REFUND_STATUS", module: "Refund",
    targetId: order._id, targetName: order.orderNumber,
    changes: { status }, req,
  });

  // Notify customer
  await Notification.create({
    user: order.customer,
    title: `Refund Request ${status}`,
    message: `Your refund request for order ${order.orderNumber} has been ${status.toLowerCase()}.`,
    type: "order",
    link: `/dashboard`,
  });

  return successResponse(res, { order }, `Refund status updated to ${status}.`);
});

// ─── Dashboard Stats (Admin) ─────────────────────────────────────────────────
export const getRefundStats = asyncHandler(async (req, res) => {
  const totalRequests = await Order.countDocuments({ "refund.status": { $ne: "None" } });
  const pendingRefunds = await Order.countDocuments({ "refund.status": "Pending" });
  const approvedRefunds = await Order.countDocuments({ "refund.status": "Approved" });
  const rejectedRefunds = await Order.countDocuments({ "refund.status": "Rejected" });
  const refundedOrders = await Order.countDocuments({ "refund.status": "Refunded" });

  const refundedAmountAgg = await Order.aggregate([
    { $match: { "refund.status": "Refunded" } },
    { $group: { _id: null, total: { $sum: "$total" } } }
  ]);
  const refundedAmount = refundedAmountAgg[0]?.total || 0;

  return successResponse(res, {
    stats: {
      totalRequests,
      pendingRefunds,
      approvedRefunds,
      rejectedRefunds,
      refundedOrders,
      refundedAmount
    }
  }, "Refund stats fetched.");
});
