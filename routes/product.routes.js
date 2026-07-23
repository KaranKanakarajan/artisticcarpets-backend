import { Router } from "express";
import { body, param } from "express-validator";

import { protect } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
  uploadProductImages,
  handleUploadError,
} from "../middleware/upload.middleware.js";

import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getProductBySlug,
  getFeaturedProducts,
  getTrendingProducts,
  getBestSellerProducts,
  getNewArrivalProducts,
  getRelatedProducts,
  getProductStats,
  archiveProduct,
  restoreProduct,
  bulkUpdateProducts,
  deleteProductImage,
  getAdminProducts,
} from "../controllers/product.controller.js";

const router = Router();

// ─────────────────────────────────────────────────────────────
// Validation chains (reused across create & update)
// ─────────────────────────────────────────────────────────────

/** Validation rules for creating a product */
const createProductValidation = [
  body("title")
    .notEmpty().withMessage("Title is required.")
    .isLength({ max: 200 }).withMessage("Title cannot exceed 200 characters."),

  body("price")
    .notEmpty().withMessage("Price is required.")
    .isFloat({ min: 0 }).withMessage("Price must be a non-negative number."),

  body("category")
    .notEmpty().withMessage("Category is required."),

  body("discountPrice")
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage("Discount price must be a non-negative number."),

  body("stock")
    .optional()
    .isInt({ min: 0 }).withMessage("Stock cannot be negative."),
];

/** Validation rules for updating a product */
const updateProductValidation = [
  body("title")
    .optional()
    .isLength({ min: 1, max: 200 }).withMessage("Title must be 1-200 characters."),

  body("price")
    .optional()
    .isFloat({ min: 0 }).withMessage("Price must be a non-negative number."),

  body("discountPrice")
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage("Discount price must be a non-negative number."),

  body("stock")
    .optional()
    .isInt({ min: 0 }).withMessage("Stock cannot be negative."),
];

/** ObjectId param validator */
const mongoIdParam = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`${paramName} must be a valid MongoDB ObjectId.`);

// ─────────────────────────────────────────────────────────────
//  ADMIN ROUTES  (protected + admin-only + file upload)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/products/stats
 * Get overall product statistics (Admin only)
 */
router.get("/products/stats", protect, isAdmin, getProductStats);

/**
 * GET /api/products/admin-list
 * Get all products including drafts and archived (Admin only)
 */
router.get("/products/admin-list", protect, isAdmin, getAdminProducts);

/**
 * POST /api/admin/products
 * Create a new product (Admin only)
 * Body: multipart/form-data
 */
router.post(
  "/products",
  protect,
  isAdmin,
  uploadProductImages,
  handleUploadError,
  createProductValidation,
  createProduct
);

/**
 * PUT /api/admin/products/:id
 * Update an existing product (Admin only)
 * Body: multipart/form-data
 */
router.put(
  "/products/:id",
  protect,
  isAdmin,
  uploadProductImages,
  handleUploadError,
  [mongoIdParam("id"), ...updateProductValidation],
  updateProduct
);

/**
 * DELETE /api/admin/products/:id
 * Delete a product and its files (Admin only)
 */
router.delete(
  "/products/:id",
  protect,
  isAdmin,
  [mongoIdParam("id")],
  deleteProduct
);

// ─────────────────────────────────────────────────────────────
//  ADMIN ROUTES  (protected + admin-only + file upload)
// ─────────────────────────────────────────────────────────────

/**
 * PATCH /api/admin/products/:id/archive
 * Archive a product (Admin only)
 */
router.patch(
  "/products/:id/archive",
  protect,
  isAdmin,
  [mongoIdParam("id")],
  archiveProduct
);

/**
 * PATCH /api/admin/products/:id/restore
 * Restore an archived product (Admin only)
 */
router.patch(
  "/products/:id/restore",
  protect,
  isAdmin,
  [mongoIdParam("id")],
  restoreProduct
);

/**
 * POST /api/admin/products/bulk
 * Bulk update/create products (Admin only)
 * Body: { products: [{ title, price, category, ... }] }
 */
router.post(
  "/products/bulk",
  protect,
  isAdmin,
  bulkUpdateProducts
);


/**
 * DELETE /api/admin/products/:id/images
 * Delete a specific image from a product (Admin only)
 * Body: { filename: "string" }
 */
router.delete(
  "/products/:id/images",
  protect,
  isAdmin,
  [mongoIdParam("id")],
  deleteProductImage
);

// ─────────────────────────────────────────────────────────────
//  PUBLIC ROUTES  (no auth required)
//
//  ⚠️  IMPORTANT: Static slug routes (featured, trending, etc.)
//  MUST be declared BEFORE  /:slug  to prevent Express from
//  treating "featured" as a slug value.
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/products/featured
 * Returns products marked as isFeatured
 * Query: ?limit=12
 */
router.get("/products/featured", getFeaturedProducts);

/**
 * GET /api/products/trending
 * Returns products marked as isTrending
 * Query: ?limit=12
 */
router.get("/products/trending", getTrendingProducts);

/**
 * GET /api/products/bestseller
 * Returns products marked as isBestSeller
 * Query: ?limit=12
 */
router.get("/products/bestseller", getBestSellerProducts);

/**
 * GET /api/products/new-arrivals
 * Returns products marked as isNewArrival
 * Query: ?limit=12
 */
router.get("/products/new-arrivals", getNewArrivalProducts);

/**
 * GET /api/products/related/:id
 * Returns related products based on category and collection
 * Query: ?limit=8
 */
router.get(
  "/products/related/:id",
  [mongoIdParam("id")],
  getRelatedProducts
);

/**
 * GET /api/products
 * Returns paginated list of active products with full filtering
 * Query: page, limit, search, category, material, color, size,
 *        shape, style, collection, minPrice, maxPrice, inStock,
 *        sort (newest|oldest|price_low|price_high|rating|bestselling)
 */
router.get("/products", getAllProducts);

/**
 * GET /api/products/:slug
 * Returns a single active product by its URL slug
 */
router.get("/products/:slug", getProductBySlug);

export default router;
