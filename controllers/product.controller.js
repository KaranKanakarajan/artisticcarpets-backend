import { validationResult } from "express-validator";
import slugify from "slugify";
import mongoose from "mongoose";

import Product from "../models/product.model.js";
import {
  sendSuccess,
  sendError,
  generateSKU,
  calcDiscountPercentage,
  deleteFile,
  deleteFiles,
  buildImageObject,
} from "../utils/helpers.js";

// ════════════════════════════════════════════════════════════════
//  ADMIN: Create Product
//  POST /api/admin/products
// ════════════════════════════════════════════════════════════════
export const createProduct = async (req, res) => {
  try {
    // ── 1. Validation errors ──────────────────
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 422, "Validation failed.", errors.array());
    }

    // ── 2. Require at least one product image ──
    if (!req.files?.images || req.files.images.length === 0) {
      return sendError(res, 400, "At least one product image is required.");
    }

    const {
      title,
      shortDescription,
      description,
      category,
      subCategory,
      collection,
      price,
      discountPrice,
      sku,
      stock,
      material,
      size,
      shape,
      color,
      style,
      room,
      origin,
      weavingType,
      pileHeight,
      weight,
      isFeatured,
      isTrending,
      isBestSeller,
      isNewArrival,
      status,
      metaTitle,
      metaDescription,
      metaKeywords,
      refundPolicyEnabled,
      refundPolicyRefundWindow,
      refundPolicyDescription,
      refundPolicyReasonRequired,
      refundPolicyShippingResponsibility,
      refundPolicyRequiredCondition,
    } = req.body;

    const parsedPrice = parseFloat(price);
    const parsedDiscountPrice = discountPrice ? parseFloat(discountPrice) : null;

    // ── 3. Discount price validation ───────────
    if (parsedDiscountPrice !== null && parsedDiscountPrice >= parsedPrice) {
      return sendError(res, 400, "Discount price must be less than the original price.");
    }

    // ── 4. Generate unique slug ────────────────
    let slug = slugify(title, { lower: true, strict: true });
    const slugExists = await Product.findOne({ slug });
    if (slugExists) {
      slug = `${slug}-${Date.now()}`;
    }

    // ── 5. SKU auto-generation ─────────────────
    const finalSKU = sku?.trim() ? sku.trim().toUpperCase() : generateSKU();

    // ── 6. Discount percentage ─────────────────
    const discountPercentage = calcDiscountPercentage(parsedPrice, parsedDiscountPrice);

    // ── 7. Build image objects from Multer files
    const thumbnailFile = req.files?.thumbnail?.[0];
    const thumbnail = thumbnailFile ? buildImageObject(thumbnailFile) : null;
    const images = req.files.images.map(buildImageObject);

    // ── 8. Parse metaKeywords (comma string → array)
    const parsedKeywords =
      typeof metaKeywords === "string"
        ? metaKeywords.split(",").map((k) => k.trim()).filter(Boolean)
        : Array.isArray(metaKeywords)
          ? metaKeywords
          : [];

    // ── 9. Create product ──────────────────────
    const product = await Product.create({
      title,
      slug,
      shortDescription,
      description,
      category,
      subCategory,
      collection,
      price: parsedPrice,
      discountPrice: parsedDiscountPrice,
      discountPercentage,
      sku: finalSKU,
      stock: stock !== undefined ? parseInt(stock, 10) : 0,
      material,
      size,
      shape,
      color,
      style,
      room,
      origin,
      weavingType,
      pileHeight,
      weight,
      thumbnail,
      images,
      isFeatured: isFeatured === "true" || isFeatured === true,
      isTrending: isTrending === "true" || isTrending === true,
      isBestSeller: isBestSeller === "true" || isBestSeller === true,
      isNewArrival: isNewArrival === "true" || isNewArrival === true,
      status: status || "active",
      metaTitle,
      metaDescription,
      metaKeywords: parsedKeywords,
      refundPolicy: {
        enabled: refundPolicyEnabled === "true" || refundPolicyEnabled === true,
        refundWindow: refundPolicyRefundWindow ? parseInt(refundPolicyRefundWindow, 10) : 0,
        description: refundPolicyDescription || "",
        reasonRequired: refundPolicyReasonRequired === "true" || refundPolicyReasonRequired === true,
        shippingResponsibility: refundPolicyShippingResponsibility || "Customer",
        requiredCondition: refundPolicyRequiredCondition || "Unused"
      },
      createdBy: req.user?.id || null,
    });

    return sendSuccess(res, 201, "Product created successfully.", product);
  } catch (error) {
    console.error("createProduct error:", error);

    // Clean up uploaded files if DB save fails
    if (req.files) {
      const allFiles = [
        ...(req.files?.thumbnail || []),
        ...(req.files?.images || []),
      ].map((f) => f.path);
      await deleteFiles(allFiles);
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return sendError(res, 409, `Duplicate value for field: ${field}.`);
    }

    return sendError(res, 500, "Internal server error while creating product.");
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Get All Products (Includes draft, archived, etc.)
//  GET /api/admin/products
// ════════════════════════════════════════════════════════════════
export const getAdminProducts = async (req, res) => {
  try {
    const { status, keyword, limit = 100 } = req.query;
    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    if (keyword) {
      filter.$or = [
        { title: { $regex: new RegExp(keyword, "i") } },
        { sku: { $regex: new RegExp(keyword, "i") } }
      ];
    }

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10));

    return sendSuccess(res, 200, "Admin products retrieved successfully.", {
      products,
      count: products.length
    });
  } catch (error) {
    console.error("getAdminProducts error:", error);
    return sendError(res, 500, "Internal server error while fetching admin products.");
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Update Product
//  PUT /api/admin/products/:id
// ════════════════════════════════════════════════════════════════
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, "Invalid product ID.");
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 422, "Validation failed.", errors.array());
    }

    const product = await Product.findById(id);
    if (!product) {
      return sendError(res, 404, "Product not found.");
    }

    const {
      title,
      shortDescription,
      description,
      category,
      subCategory,
      collection,
      price,
      discountPrice,
      sku,
      stock,
      material,
      size,
      shape,
      color,
      style,
      room,
      origin,
      weavingType,
      pileHeight,
      weight,
      isFeatured,
      isTrending,
      isBestSeller,
      isNewArrival,
      status,
      metaTitle,
      metaDescription,
      metaKeywords,
      refundPolicyEnabled,
      refundPolicyRefundWindow,
      refundPolicyDescription,
      refundPolicyReasonRequired,
      refundPolicyShippingResponsibility,
      refundPolicyRequiredCondition,
    } = req.body;

    // ── Price & discount ───────────────────────
    const parsedPrice = price !== undefined ? parseFloat(price) : product.price;
    const parsedDiscountPrice =
      discountPrice !== undefined
        ? discountPrice === "" || discountPrice === null
          ? null
          : parseFloat(discountPrice)
        : product.discountPrice;

    if (parsedDiscountPrice !== null && parsedDiscountPrice >= parsedPrice) {
      return sendError(res, 400, "Discount price must be less than the original price.");
    }

    const discountPercentage = calcDiscountPercentage(parsedPrice, parsedDiscountPrice);

    // ── Slug regeneration if title changed ─────
    let slug = product.slug;
    if (title && title !== product.title) {
      slug = slugify(title, { lower: true, strict: true });
      const slugExists = await Product.findOne({ slug, _id: { $ne: id } });
      if (slugExists) slug = `${slug}-${Date.now()}`;
    }

    // ── Thumbnail replacement ──────────────────
    let thumbnail = product.thumbnail;
    if (req.files?.thumbnail?.[0]) {
      // Delete old thumbnail from disk
      if (product.thumbnail?.path) await deleteFile(product.thumbnail.path);
      thumbnail = buildImageObject(req.files.thumbnail[0]);
    }

    // ── Images replacement ─────────────────────
    let images = product.images;
    if (req.files?.images && req.files.images.length > 0) {
      // Delete all old images from disk
      const oldPaths = product.images.map((img) => img.path);
      await deleteFiles(oldPaths);
      images = req.files.images.map(buildImageObject);
    }

    // ── metaKeywords ───────────────────────────
    const parsedKeywords =
      metaKeywords !== undefined
        ? typeof metaKeywords === "string"
          ? metaKeywords.split(",").map((k) => k.trim()).filter(Boolean)
          : Array.isArray(metaKeywords)
            ? metaKeywords
            : product.metaKeywords
        : product.metaKeywords;

    // ── Apply all updates ──────────────────────
    Object.assign(product, {
      title: title || product.title,
      slug,
      shortDescription: shortDescription ?? product.shortDescription,
      description: description ?? product.description,
      category: category || product.category,
      subCategory: subCategory ?? product.subCategory,
      collection: collection ?? product.collection,
      price: parsedPrice,
      discountPrice: parsedDiscountPrice,
      discountPercentage,
      sku: sku?.trim() ? sku.trim().toUpperCase() : product.sku,
      stock: stock !== undefined ? parseInt(stock, 10) : product.stock,
      material: material ?? product.material,
      size: size ?? product.size,
      shape: shape ?? product.shape,
      color: color ?? product.color,
      style: style ?? product.style,
      room: room ?? product.room,
      origin: origin ?? product.origin,
      weavingType: weavingType ?? product.weavingType,
      pileHeight: pileHeight ?? product.pileHeight,
      weight: weight ?? product.weight,
      thumbnail,
      images,
      isFeatured:
        isFeatured !== undefined
          ? isFeatured === "true" || isFeatured === true
          : product.isFeatured,
      isTrending:
        isTrending !== undefined
          ? isTrending === "true" || isTrending === true
          : product.isTrending,
      isBestSeller:
        isBestSeller !== undefined
          ? isBestSeller === "true" || isBestSeller === true
          : product.isBestSeller,
      isNewArrival:
        isNewArrival !== undefined
          ? isNewArrival === "true" || isNewArrival === true
          : product.isNewArrival,
      status: status || product.status,
      metaTitle: metaTitle ?? (product.metaTitle),
      metaDescription: metaDescription ?? (product.metaDescription),
      metaKeywords: parsedKeywords,
      refundPolicy: {
        enabled: refundPolicyEnabled !== undefined 
          ? (refundPolicyEnabled === "true" || refundPolicyEnabled === true) 
          : product.refundPolicy?.enabled || false,
        refundWindow: refundPolicyRefundWindow !== undefined 
          ? parseInt(refundPolicyRefundWindow, 10) 
          : product.refundPolicy?.refundWindow || 0,
        description: refundPolicyDescription ?? (product.refundPolicy?.description || ""),
        reasonRequired: refundPolicyReasonRequired !== undefined 
          ? (refundPolicyReasonRequired === "true" || refundPolicyReasonRequired === true) 
          : product.refundPolicy?.reasonRequired || false,
        shippingResponsibility: refundPolicyShippingResponsibility ?? (product.refundPolicy?.shippingResponsibility || "Customer"),
        requiredCondition: refundPolicyRequiredCondition ?? (product.refundPolicy?.requiredCondition || "Unused"),
      }
    });

    await product.save();

    return sendSuccess(res, 200, "Product updated successfully.", product);
  } catch (error) {
    console.error("updateProduct error:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return sendError(res, 409, `Duplicate value for field: ${field}.`);
    }

    return sendError(res, 500, "Internal server error while updating product.");
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Archive Product
//  PATCH /api/admin/products/:id/archive
// ════════════════════════════════════════════════════════════════
export const archiveProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return sendError(res, 404, "Product not found.");
    }

    product.status = "archived";
    await product.save();

    return sendSuccess(res, 200, "Product archived successfully.", {
      product,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to archive product.", error.message);
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Restore Product
//  PATCH /api/admin/products/:id/restore
// ════════════════════════════════════════════════════════════════
export const restoreProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return sendError(res, 404, "Product not found.");
    }

    product.status = "active";
    await product.save();

    return sendSuccess(res, 200, "Product restored successfully.", {
      product,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to restore product.", error.message);
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Bulk Update/Create Products
//  POST /api/admin/products/bulk
// ════════════════════════════════════════════════════════════════
export const bulkUpdateProducts = async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return sendError(res, 400, "Please provide an array of products.");
    }

    const bulkOps = products.map((prod) => {
      // If product lacks a title or price but is being created, it will fail schema validation later,
      // but for bulkWrite upsert based on SKU, we do our best.
      const sku = prod.sku || generateSKU();

      // Auto-generate slug if not present but title is
      if (!prod.slug && prod.title) {
        prod.slug = slugify(prod.title, { lower: true, strict: true }) + '-' + Date.now().toString().slice(-4);
      }

      // Calculate discount percentage if both prices are provided
      if (prod.price && prod.discountPrice) {
        prod.discountPercentage = calcDiscountPercentage(prod.price, prod.discountPrice);
      }

      return {
        updateOne: {
          filter: { sku: sku },
          update: { $set: { ...prod, sku } },
          upsert: true,
        },
      };
    });

    const result = await Product.bulkWrite(bulkOps);

    return sendSuccess(res, 200, "Bulk operation completed successfully.", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to process bulk operation.", error.message);
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Delete Product Image
//  DELETE /api/admin/products/:id/images
// ════════════════════════════════════════════════════════════════
export const deleteProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { filename } = req.body;

    if (!filename) {
      return sendError(res, 400, "Image filename is required in the request body.");
    }

    const product = await Product.findById(id);
    if (!product) {
      return sendError(res, 404, "Product not found.");
    }

    // Find the image
    const imageIndex = product.images.findIndex((img) => img.filename === filename);
    if (imageIndex === -1) {
      return sendError(res, 404, "Image not found in this product.");
    }

    const imagePath = product.images[imageIndex].path;

    // Remove from array
    product.images.splice(imageIndex, 1);
    await product.save();

    // Delete from filesystem/cloud
    await deleteFile(imagePath);

    return sendSuccess(res, 200, "Product image deleted successfully.", {
      images: product.images,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to delete product image.", error.message);
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Delete Product
//  DELETE /api/admin/products/:id
// ════════════════════════════════════════════════════════════════
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, "Invalid product ID.");
    }

    const product = await Product.findById(id);
    if (!product) {
      return sendError(res, 404, "Product not found.");
    }

    // ── Collect all file paths to delete ───────
    const filesToDelete = [];
    if (product.thumbnail?.path) filesToDelete.push(product.thumbnail.path);
    product.images.forEach((img) => filesToDelete.push(img.path));

    // ── Delete from DB first ───────────────────
    await product.deleteOne();

    // ── Then delete files from disk ────────────
    await deleteFiles(filesToDelete);

    return sendSuccess(res, 200, "Product deleted successfully.");
  } catch (error) {
    console.error("deleteProduct error:", error);
    return sendError(res, 500, "Internal server error while deleting product.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: Get All Products
//  GET /api/products
// ════════════════════════════════════════════════════════════════
export const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      ids,
      category,
      subCategory,
      collection,
      material,
      color,
      size,
      shape,
      style,
      minPrice,
      maxPrice,
      inStock,
      sort = "newest",
    } = req.query;

    const filter = { status: "active" };

    if (ids) {
      const idArray = ids.split(",").filter(id => mongoose.Types.ObjectId.isValid(id.trim()));
      if (idArray.length > 0) {
        filter._id = { $in: idArray };
      }
    }

    // ── Full-text search ───────────────────────
    if (search) {
      filter.$text = { $search: search };
    }

    // ── Attribute filters ──────────────────────
    if (category) filter.category = { $regex: new RegExp(category, "i") };
    if (subCategory) filter.subCategory = { $regex: new RegExp(subCategory, "i") };
    if (collection) filter.collection = { $regex: new RegExp(collection, "i") };
    if (material) filter.material = { $regex: new RegExp(material, "i") };
    if (color) filter.color = { $regex: new RegExp(color, "i") };
    if (size) filter.size = { $regex: new RegExp(size, "i") };
    if (shape) filter.shape = { $regex: new RegExp(shape, "i") };
    if (style) filter.style = { $regex: new RegExp(style, "i") };

    // ── Price range ────────────────────────────
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // ── Stock filter ───────────────────────────
    if (inStock === "true") filter.stock = { $gt: 0 };

    // ── Sorting ────────────────────────────────
    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      price_low: { price: 1 },
      price_high: { price: -1 },
      rating: { ratingAverage: -1 },
      bestselling: { totalSales: -1 },
    };
    const sortQuery = sortOptions[sort] || sortOptions.newest;

    // ── Pagination ─────────────────────────────
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .select("-__v")
        .lean(),
      Product.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, "Products fetched successfully.", {
      products,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("getAllProducts error:", error);
    return sendError(res, 500, "Internal server error while fetching products.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: Get Product By Slug
//  GET /api/products/:slug
// ════════════════════════════════════════════════════════════════
export const getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    let query = { status: "active" };

    if (mongoose.Types.ObjectId.isValid(slug)) {
      query._id = slug;
    } else {
      query.slug = slug;
    }

    const product = await Product.findOne(query)
      .select("-__v")
      .lean();

    if (!product) {
      return sendError(res, 404, `Product not found. We searched for an active product with the identifier: '${slug}'`);
    }

    return sendSuccess(res, 200, "Product fetched successfully.", product);
  } catch (error) {
    console.error("getProductBySlug error:", error);
    return sendError(res, 500, "Internal server error.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: Featured Products
//  GET /api/products/featured
// ════════════════════════════════════════════════════════════════
export const getFeaturedProducts = async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const products = await Product.find({ isFeatured: true, status: "active" })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .select("-__v")
      .lean();

    return sendSuccess(res, 200, "Featured products fetched successfully.", products);
  } catch (error) {
    console.error("getFeaturedProducts error:", error);
    return sendError(res, 500, "Internal server error.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: Trending Products
//  GET /api/products/trending
// ════════════════════════════════════════════════════════════════
export const getTrendingProducts = async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const products = await Product.find({ isTrending: true, status: "active" })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .select("-__v")
      .lean();

    return sendSuccess(res, 200, "Trending products fetched successfully.", products);
  } catch (error) {
    console.error("getTrendingProducts error:", error);
    return sendError(res, 500, "Internal server error.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: Best Sellers
//  GET /api/products/bestseller
// ════════════════════════════════════════════════════════════════
export const getBestSellerProducts = async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const products = await Product.find({ isBestSeller: true, status: "active" })
      .sort({ totalSales: -1 })
      .limit(parseInt(limit, 10))
      .select("-__v")
      .lean();

    return sendSuccess(res, 200, "Best seller products fetched successfully.", products);
  } catch (error) {
    console.error("getBestSellerProducts error:", error);
    return sendError(res, 500, "Internal server error.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: New Arrivals
//  GET /api/products/new-arrivals
// ════════════════════════════════════════════════════════════════
export const getNewArrivalProducts = async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const products = await Product.find({ isNewArrival: true, status: "active" })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .select("-__v")
      .lean();

    return sendSuccess(res, 200, "New arrival products fetched successfully.", products);
  } catch (error) {
    console.error("getNewArrivalProducts error:", error);
    return sendError(res, 500, "Internal server error.");
  }
};

// ════════════════════════════════════════════════════════════════
//  PUBLIC: Related Products
//  GET /api/products/related/:id
// ════════════════════════════════════════════════════════════════
export const getRelatedProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 8 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 400, "Invalid product ID.");
    }

    const product = await Product.findById(id).lean();
    if (!product) {
      return sendError(res, 404, "Product not found.");
    }

    // Match by category OR collection, exclude the current product
    const related = await Product.find({
      _id: { $ne: product._id },
      status: "active",
      $or: [
        { category: product.category },
        ...(product.collection ? [{ collection: product.collection }] : []),
      ],
    })
      .sort({ ratingAverage: -1 })
      .limit(parseInt(limit, 10))
      .select("-__v")
      .lean();

    return sendSuccess(res, 200, "Related products fetched successfully.", related);
  } catch (error) {
    console.error("getRelatedProducts error:", error);
    return sendError(res, 500, "Internal server error.");
  }
};

// ════════════════════════════════════════════════════════════════
//  ADMIN: Get Product Stats
//  GET /api/products/stats
// ════════════════════════════════════════════════════════════════
export const getProductStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ status: "active" });
    const outOfStock = await Product.countDocuments({ stock: 0 });
    const featured = await Product.countDocuments({ isFeatured: true });

    return sendSuccess(res, 200, "Product stats fetched.", {
      total: totalProducts,
      active: activeProducts,
      outOfStock,
      featured,
    });
  } catch (error) {
    console.error("getProductStats error:", error);
    return sendError(res, 500, "Internal server error fetching product stats.");
  }
};
