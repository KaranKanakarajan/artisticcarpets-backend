import { Router } from "express";
import {
  getInventoryOverview,
  adjustStock,
  bulkStockUpdate,
  getInventoryMovements,
  getInventoryStats,
  exportInventory,
} from "../controllers/inventory.controller.js";
import { protect, adminOnly, authorize } from "../middleware/auth.middleware.js";

const router = Router();

router.get  ("/"          , protect, authorize("admin","super_admin","manager","inventory_manager","sales_manager"), getInventoryOverview);
router.get  ("/stats"     , protect, authorize("admin","super_admin","manager","inventory_manager"), getInventoryStats);
router.get  ("/movements" , protect, authorize("admin","super_admin","manager","inventory_manager"), getInventoryMovements);
router.get  ("/export"    , protect, authorize("admin","super_admin","manager","inventory_manager"), exportInventory);
router.post ("/adjust"    , protect, authorize("admin","super_admin","manager","inventory_manager"), adjustStock);
router.post ("/bulk"      , protect, authorize("admin","super_admin","manager","inventory_manager"), bulkStockUpdate);

export default router;
