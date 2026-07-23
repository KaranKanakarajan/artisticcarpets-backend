import { Router } from "express";
import {
  getDashboardStats,
  getRevenueChart,
  getTopProducts,
  getTopCategories,
  getSalesByCountry,
  getCustomerRetention,
  getConversionFunnel,
  getComprehensiveDashboard,
} from "../controllers/analytics.controller.js";
import { protect, adminOnly } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/dashboard"          , protect, adminOnly, getDashboardStats);
router.get("/revenue-chart"      , protect, adminOnly, getRevenueChart);
router.get("/top-products"       , protect, adminOnly, getTopProducts);
router.get("/top-categories"     , protect, adminOnly, getTopCategories);
router.get("/sales-by-country"   , protect, adminOnly, getSalesByCountry);
router.get("/customer-retention" , protect, adminOnly, getCustomerRetention);
router.get("/conversion-funnel"  , protect, adminOnly, getConversionFunnel);
router.get("/comprehensive"      , protect, adminOnly, getComprehensiveDashboard);

export default router;
