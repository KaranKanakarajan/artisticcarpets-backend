import Product from "../models/product.model.js";
import InventoryMovement from "../models/inventory.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  parsePagination,
  buildPagination,
} from "../utils/apiResponse.js";
import { createAuditLog } from "../utils/auditLog.utils.js";

// ─── Get Inventory Overview ───────────────────────────────────────────────────

export const getInventoryOverview = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const {
    search, category, collection,
    stockStatus, sort = "-updatedAt",
  } = req.query;

  const filter = { status: { $ne: "archived" } };
  if (search)   filter.$text    = { $search: search };
  if (category) filter.category = category;
  if (collection) filter.collection = collection;

  if (stockStatus === "in_stock")   filter.stock = { $gt: 10 };
  if (stockStatus === "low_stock")  filter.stock = { $gt: 0, $lte: 10 };
  if (stockStatus === "out_of_stock") filter.stock = 0;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name")
      .populate("collection", "name")
      .select("name sku mainImage stock reservedStock minimumStock price warehouse isActive")
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  return paginatedResponse(res, products, buildPagination(page, limit, total));
});

// ─── Adjust Stock ─────────────────────────────────────────────────────────────

export const adjustStock = asyncHandler(async (req, res) => {
  const { productId, quantity, type, notes, warehouse, costPrice, price, minStockLevel, reason } = req.body;

  const product = await Product.findById(productId);
  if (!product) return errorResponse(res, "Product not found.", 404);

  const previousStock = product.stock;
  
  if (quantity !== undefined) {
    const newStock = previousStock + Number(quantity);
    if (newStock < 0) {
      return errorResponse(res, "Stock cannot go below 0.", 400);
    }
    product.stock = newStock;

    await InventoryMovement.create({
      product: product._id,
      sku: product.sku,
      type: type || "adjustment",
      quantity: Number(quantity),
      previousStock,
      newStock,
      warehouse,
      notes: reason ? `${reason} - ${notes || ''}` : (notes || "Stock adjusted"),
      performedBy: req.user._id,
    });
  }

  if (warehouse) product.warehouse = warehouse;
  if (costPrice !== undefined) product.costPrice = costPrice;
  if (price !== undefined) product.price = price;
  if (minStockLevel !== undefined) product.minStockLevel = minStockLevel;
  
  await product.save();

  await createAuditLog({
    user: req.user, action: "ADJUST_STOCK", module: "Inventory",
    targetId: product._id, targetName: product.title,
    changes: { previousStock, newStock: product.stock, quantity, costPrice, price, minStockLevel },
    req,
  });

  return successResponse(res, {
    product: { _id: product._id, title: product.title, stock: product.stock, sku: product.sku },
  }, "Stock adjusted.");
});

// ─── Bulk Stock Update ────────────────────────────────────────────────────────

export const bulkStockUpdate = asyncHandler(async (req, res) => {
  const { updates } = req.body;
  // updates: [{ productId, stock, notes }]

  if (!updates?.length) return errorResponse(res, "No updates provided.", 400);

  const results = [];

  for (const u of updates) {
    const product = await Product.findById(u.productId);
    if (!product) { results.push({ productId: u.productId, error: "Not found" }); continue; }

    const previousStock = product.stock;
    product.stock = Number(u.stock);
    await product.save();

    await InventoryMovement.create({
      product: product._id,
      sku: product.sku,
      type: "adjustment",
      quantity: product.stock - previousStock,
      previousStock,
      newStock: product.stock,
      notes: u.notes || "Bulk stock update",
      performedBy: req.user._id,
    });

    results.push({ productId: u.productId, name: product.name, stock: product.stock });
  }

  return successResponse(res, { results }, "Bulk stock update completed.");
});

// ─── Inventory Movements ──────────────────────────────────────────────────────

export const getInventoryMovements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { productId, type, startDate, endDate, sort = "-createdAt" } = req.query;

  const filter = {};
  if (productId)          filter.product   = productId;
  if (type)               filter.type      = type;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate)   filter.createdAt.$lte = new Date(endDate);
  }

  const [movements, total] = await Promise.all([
    InventoryMovement.find(filter)
      .populate("product", "name sku mainImage")
      .populate("performedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(limit),
    InventoryMovement.countDocuments(filter),
  ]);

  return paginatedResponse(res, movements, buildPagination(page, limit, total));
});

// ─── Inventory Stats ──────────────────────────────────────────────────────────

export const getInventoryStats = asyncHandler(async (req, res) => {
  const [total, lowStock, outOfStock, totalValue] = await Promise.all([
    Product.countDocuments({ status: { $ne: "archived" } }),
    Product.countDocuments({ stock: { $gt: 0, $lte: 10 }, status: { $ne: "archived" } }),
    Product.countDocuments({ stock: 0, status: { $ne: "archived" } }),
    Product.aggregate([
      { $match: { status: { $ne: "archived" } } },
      { $group: { _id: null, value: { $sum: { $multiply: ["$price", "$stock"] } } } },
    ]),
  ]);

  // Low stock items list
  const lowStockItems = await Product.find({
    stock: { $gt: 0, $lte: 10 }, status: { $ne: "archived" }
  })
    .select("name sku stock minimumStock mainImage")
    .sort("stock")
    .limit(10);

  return successResponse(res, {
    stats: {
      total,
      lowStock,
      outOfStock,
      inStock: total - outOfStock,
      inventoryValue: totalValue[0]?.value || 0,
    },
    lowStockItems,
  }, "Inventory stats fetched.");
});

// ─── Export CSV ───────────────────────────────────────────────────────────────

export const exportInventory = asyncHandler(async (req, res) => {
  const products = await Product.find({ status: { $ne: "archived" } }).lean();
  
  if (products.length === 0) return errorResponse(res, "No products to export", 404);

  const headers = ["Title", "SKU", "Category", "Cost Price", "Selling Price", "Total Stock", "Reserved Stock", "Available Stock", "Min Stock"];
  const rows = products.map(p => [
    `"${(p.title || p.name || "").replace(/"/g, '""')}"`, 
    p.sku || "", 
    p.category || "", 
    p.costPrice || 0, 
    p.price || 0, 
    p.stock || 0, 
    p.reservedStock || 0, 
    Math.max(0, (p.stock || 0) - (p.reservedStock || 0)), 
    p.minStockLevel || 0
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

  res.header('Content-Type', 'text/csv');
  res.attachment('inventory_export.csv');
  return res.send(csv);
});
