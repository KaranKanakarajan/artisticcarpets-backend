import DamageInventory from "../models/damage.model.js";
import Product from "../models/product.model.js";
import InventoryMovement from "../models/inventory.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sendError } from "../utils/helpers.js";
import { paginatedResponse, successResponse } from "../utils/apiResponse.js";
import mongoose from "mongoose";

// Report damage and reduce stock
export const reportDamage = asyncHandler(async (req, res) => {
  const { productId, sku, quantity, damageReason, description, imageUrl } = req.body;

  if (!productId || !quantity || !damageReason) {
    return sendError(res, 400, "Product, Quantity, and Damage Reason are required.");
  }

  const product = await Product.findById(productId);
  if (!product) return sendError(res, 404, "Product not found.");

  if (product.stock < quantity) {
    return sendError(res, 400, `Insufficient stock to mark as damaged. Available: ${product.stock}`);
  }

  // Create damage record
  const damageRecord = await DamageInventory.create({
    product: productId,
    sku: sku || product.sku,
    quantity,
    damageReason,
    description,
    imageUrl,
    reportedBy: req.user._id,
    status: "Pending Inspection",
    actionLog: [
      {
        action: "Reported Damage",
        performedBy: req.user._id,
        notes: "Initial damage report created.",
      }
    ]
  });

  // Reduce product stock
  const previousStock = product.stock;
  product.stock -= quantity;
  await product.save();

  // Log inventory movement
  await InventoryMovement.create({
    product: productId,
    sku: sku || product.sku,
    type: "damage",
    quantity: -quantity, // Negative for stock reduction
    previousStock,
    newStock: product.stock,
    reference: "Damage Report",
    referenceId: damageRecord._id,
    notes: `Damage reported: ${damageReason}`,
    performedBy: req.user._id,
  });

  return successResponse(res, { damageRecord }, "Damage reported successfully.", 201);
});

// Get all damaged items
export const getDamagedItems = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, reason, search } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (status) filter.status = status;
  if (reason) filter.damageReason = reason;

  // Search logic if necessary (by product title/sku via aggregation or populate filtering)
  // For simplicity, doing a basic find with populate. If search string is used, we might need a regex on populated fields, 
  // but Mongoose makes it tricky to filter parent by populated child fields without aggregation.
  // Assuming basic query for now.

  let query = DamageInventory.find(filter)
    .populate("product", "title mainImage thumbnail price")
    .populate("reportedBy", "firstName lastName name email")
    .sort({ createdAt: -1 });

  const total = await DamageInventory.countDocuments(filter);
  const items = await query.skip(skip).limit(parseInt(limit)).exec();

  // Handle pagination response correctly
  const totalPages = Math.ceil(total / limit);
  return paginatedResponse(res, items, { page: parseInt(page), limit: parseInt(limit), total, totalPages });
});

// Update status
export const updateDamageStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, restoreToStock } = req.body; // restoreToStock is boolean

  if (!status) return sendError(res, 400, "Status is required.");

  const damageRecord = await DamageInventory.findById(id);
  if (!damageRecord) return sendError(res, 404, "Damage record not found.");

  const oldStatus = damageRecord.status;
  damageRecord.status = status;
  
  damageRecord.actionLog.push({
    action: `Status changed to ${status}`,
    performedBy: req.user._id,
    notes: notes || "No notes provided.",
  });

  await damageRecord.save();

  // If status is Disposed and it triggers a notification
  if (status === "Disposed" && oldStatus !== "Disposed") {
    // Notify admins (Assuming role 'admin' or 'super_admin')
    const admins = await User.find({ role: { $in: ["admin", "super_admin", "inventory_manager"] } });
    const notifications = admins.map(admin => ({
      user: admin._id,
      title: "Inventory Disposed",
      message: `${damageRecord.quantity}x of SKU ${damageRecord.sku} has been disposed.`,
      type: "alert",
      read: false
    }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  }

  // Handle Restore to Stock if item is Repaired
  if (status === "Repaired" && restoreToStock === true) {
    const product = await Product.findById(damageRecord.product);
    if (product) {
      const previousStock = product.stock;
      product.stock += damageRecord.quantity;
      await product.save();

      // Log inventory movement
      await InventoryMovement.create({
        product: product._id,
        sku: damageRecord.sku,
        type: "adjustment", // Or 'return' or 'repair_restored'
        quantity: damageRecord.quantity, // Positive for stock increase
        previousStock,
        newStock: product.stock,
        reference: "Repaired Item Restored",
        referenceId: damageRecord._id,
        notes: `Restored to stock after repair. Notes: ${notes}`,
        performedBy: req.user._id,
      });

      // We might want to mark the damage record as resolved/restored, but "Repaired" is the status.
      // Maybe add another log for restoration
      damageRecord.actionLog.push({
        action: `Restored to Available Stock`,
        performedBy: req.user._id,
        notes: `Restored ${damageRecord.quantity} items to stock.`,
      });
      await damageRecord.save();
    }
  }

  return successResponse(res, { damageRecord }, "Status updated successfully.");
});

// Edit damage report
export const editDamageReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { damageReason, description, imageUrl, notes } = req.body;

  const damageRecord = await DamageInventory.findById(id);
  if (!damageRecord) return sendError(res, 404, "Damage record not found.");

  if (damageReason) damageRecord.damageReason = damageReason;
  if (description) damageRecord.description = description;
  if (imageUrl) damageRecord.imageUrl = imageUrl;

  damageRecord.actionLog.push({
    action: "Edited Report",
    performedBy: req.user._id,
    notes: notes || "Report updated by admin.",
  });

  await damageRecord.save();
  return successResponse(res, { damageRecord }, "Damage report updated.");
});

// Delete damage record
export const deleteDamageRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const damageRecord = await DamageInventory.findByIdAndDelete(id);
  if (!damageRecord) return sendError(res, 404, "Damage record not found.");

  // We could optionally restore stock here, but usually deleting a record implies it was a mistake.
  // For safety, let's leave stock as is, requiring manual adjustment if needed.
  
  return successResponse(res, null, "Damage record deleted.");
});

// Dashboard stats
export const getDamageStats = asyncHandler(async (req, res) => {
  const totalItems = await DamageInventory.aggregate([
    { $group: { _id: null, total: { $sum: "$quantity" } } }
  ]);

  const statsByStatus = await DamageInventory.aggregate([
    { $group: { _id: "$status", count: { $sum: "$quantity" } } }
  ]);

  const statsByReason = await DamageInventory.aggregate([
    { $group: { _id: "$damageReason", count: { $sum: "$quantity" } } }
  ]);

  // To calculate total loss value, we need product prices
  const lossValueAgg = await DamageInventory.aggregate([
    { $match: { status: { $nin: ["Repaired", "Returned to Supplier"] } } }, // Items still damaged/disposed
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDetails"
      }
    },
    { $unwind: "$productDetails" },
    {
      $group: {
        _id: null,
        totalLoss: { $sum: { $multiply: ["$quantity", "$productDetails.price"] } }
      }
    }
  ]);

  const total = totalItems[0]?.total || 0;
  const totalLoss = lossValueAgg[0]?.totalLoss || 0;

  const statusMap = statsByStatus.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  const reasonMap = statsByReason.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  return successResponse(res, {
    total,
    totalLoss,
    statusStats: statusMap,
    reasonStats: reasonMap
  }, "Damage stats fetched.");
});
