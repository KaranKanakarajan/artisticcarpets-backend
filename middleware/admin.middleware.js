import { sendError } from "../utils/helpers.js";

/**
 * Admin-only guard middleware.
 * Must be used AFTER the `protect` middleware so that req.user is populated.
 *
 * Usage in routes:
 *   router.post("/", protect, isAdmin, createProduct);
 */
export const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === "admin" || req.user.role === "super_admin")) {
    return next();
  }
  return sendError(
    res,
    403,
    "Forbidden. Admin privileges required for this action."
  );
};
