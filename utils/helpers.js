import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

// ─────────────────────────────────────────────
// Send a standardised JSON success response
// ─────────────────────────────────────────────
export const sendSuccess = (res, statusCode, message, data = null) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  return res.status(statusCode).json(response);
};

// ─────────────────────────────────────────────
// Send a standardised JSON error response
// ─────────────────────────────────────────────
export const sendError = (res, statusCode, message, errors = null) => {
  const response = { success: false, message };
  if (errors !== null) response.errors = errors;
  return res.status(statusCode).json(response);
};

// ─────────────────────────────────────────────
// Generate a SKU: CAR-XXXX-XXXX  (uppercase)
// ─────────────────────────────────────────────
export const generateSKU = () => {
  const id = uuidv4().replace(/-/g, "").toUpperCase();
  return `CAR-${id.slice(0, 4)}-${id.slice(4, 8)}`;
};

// ─────────────────────────────────────────────
// Calculate discount percentage from price & discountPrice
// Returns 0 if no valid discountPrice is provided.
// ─────────────────────────────────────────────
export const calcDiscountPercentage = (price, discountPrice) => {
  if (!discountPrice || discountPrice <= 0 || discountPrice >= price) return 0;
  return Math.round(((price - discountPrice) / price) * 100);
};

// ─────────────────────────────────────────────
// Delete a file from the local filesystem safely.
// Silently ignores ENOENT (file already deleted).
// ─────────────────────────────────────────────
export const deleteFile = async (filePath) => {
  try {
    if (!filePath) return;
    // Normalise: strip leading slash if the path stored is relative
    const normalised = filePath.startsWith("/")
      ? filePath.slice(1)
      : filePath;
    await fs.unlink(path.resolve(normalised));
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`⚠️  Could not delete file ${filePath}:`, err.message);
    }
  }
};

// ─────────────────────────────────────────────
// Delete multiple files concurrently
// ─────────────────────────────────────────────
export const deleteFiles = async (filePaths = []) => {
  await Promise.all(filePaths.map((fp) => deleteFile(fp)));
};

// ─────────────────────────────────────────────
// Build a normalised image object from a Multer file
// Stores the path relative to the project root so
// it works regardless of deployment CWD.
// ─────────────────────────────────────────────
export const buildImageObject = (file) => {
  // extract the path relative to the "uploads" folder, so we get "/uploads/products/filename.jpg"
  const normalizedPath = file.path.replace(/\\/g, "/");
  const uploadsIndex = normalizedPath.indexOf("/uploads/");
  const relativePath = uploadsIndex !== -1 ? normalizedPath.substring(uploadsIndex) : `/${file.path.replace(/\\/g, "/")}`;

  return {
    filename: file.filename,
    path: relativePath,
  };
};
