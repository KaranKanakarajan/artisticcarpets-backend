import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import Review from "../models/review.model.js";
import Complaint from "../models/complaint.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import { successResponse } from "../utils/apiResponse.js";

// ─── Dashboard Overview ───────────────────────────────────────────────────────

export const getDashboardStats = asyncHandler(async (req, res) => {
  const today      = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth  = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const [
    todayRevenue,
    monthRevenue,
    lastMonthRevenue,
    todayOrders,
    monthOrders,
    pendingOrders,
    completedOrders,
    returnedOrders,
    totalCustomers,
    newCustomersThisMonth,
    inventoryValue,
    avgOrderValue,
    totalRefundAmount,
  ] = await Promise.all([
    // Revenue
    Order.aggregate([
      { $match: { createdAt: { $gte: today }, "payment.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: monthStart }, "payment.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: lastMonth, $lte: lastMonthEnd }, "payment.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    // Orders
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.countDocuments({ createdAt: { $gte: monthStart } }),
    Order.countDocuments({ status: "pending" }),
    Order.countDocuments({ status: "delivered" }),
    Order.countDocuments({ status: { $in: ["returned", "refunded"] } }),
    // Customers
    User.countDocuments({ role: "customer" }),
    User.countDocuments({ role: "customer", createdAt: { $gte: monthStart } }),
    // Inventory
    Product.aggregate([
      { $match: { status: { $ne: "archived" } } },
      { $group: { _id: null, value: { $sum: { $multiply: ["$price", "$stock"] } } } },
    ]),
    // AOV
    Order.aggregate([
      { $match: { "payment.status": "paid" } },
      { $group: { _id: null, avg: { $avg: "$total" } } },
    ]),
    // Refunds
    Order.aggregate([
      { $match: { "payment.status": "refunded" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
  ]);

  const thisMonthRev  = monthRevenue[0]?.total     || 0;
  const lastMonthRev  = lastMonthRevenue[0]?.total  || 0;
  const revenueChange = lastMonthRev
    ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
    : 100;

  return successResponse(res, {
    stats: {
      todayRevenue:       todayRevenue[0]?.total     || 0,
      monthRevenue:       thisMonthRev,
      revenueChange,
      todayOrders,
      monthOrders,
      pendingOrders,
      completedOrders,
      returnedOrders,
      totalCustomers,
      newCustomersThisMonth,
      inventoryValue:     inventoryValue[0]?.value    || 0,
      avgOrderValue:      Math.round(avgOrderValue[0]?.avg || 0),
      totalRefundAmount:  totalRefundAmount[0]?.total  || 0,
    },
  }, "Dashboard stats fetched.");
});

// ─── Revenue Chart ────────────────────────────────────────────────────────────

export const getRevenueChart = asyncHandler(async (req, res) => {
  const period = req.query.period || "monthly"; // daily | weekly | monthly | quarterly
  const months = parseInt(req.query.months) || 12;

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months + 1);
  startDate.setDate(1);

  let groupBy;
  if (period === "daily") {
    groupBy = {
      year:  { $year: "$createdAt" },
      month: { $month: "$createdAt" },
      day:   { $dayOfMonth: "$createdAt" },
    };
  } else if (period === "weekly") {
    groupBy = {
      year: { $year: "$createdAt" },
      week: { $week: "$createdAt" },
    };
  } else if (period === "quarterly") {
    groupBy = {
      year:    { $year: "$createdAt" },
      quarter: { $ceil: { $divide: [{ $month: "$createdAt" }, 3] } },
    };
  } else {
    groupBy = {
      year:  { $year: "$createdAt" },
      month: { $month: "$createdAt" },
    };
  }

  const data = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate }, "payment.status": "paid" } },
    {
      $group: {
        _id:     groupBy,
        revenue: { $sum: "$total" },
        orders:  { $sum: 1 },
        avgValue:{ $avg: "$total" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  return successResponse(res, { chart: data }, "Revenue chart fetched.");
});

// ─── Top Products ─────────────────────────────────────────────────────────────

export const getTopProducts = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const topBySales = await Product.find({ status: { $ne: "archived" } })
    .select("name slug mainImage soldCount price rating reviewCount category")
    .populate("category", "name")
    .sort("-soldCount")
    .limit(limit);

  const topByRevenue = await Order.aggregate([
    { $match: { "payment.status": "paid" } },
    { $unwind: "$items" },
    {
      $group: {
        _id:      "$items.product",
        name:     { $first: "$items.name" },
        revenue:  { $sum: "$items.totalPrice" },
        quantity: { $sum: "$items.quantity" },
        orders:   { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);

  return successResponse(res, { topBySales, topByRevenue }, "Top products fetched.");
});

// ─── Top Categories ───────────────────────────────────────────────────────────

export const getTopCategories = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    { $match: { "payment.status": "paid" } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $lookup: {
        from: "categories",
        localField: "product.category",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $group: {
        _id:      "$category._id",
        name:     { $first: "$category.name" },
        revenue:  { $sum: "$items.totalPrice" },
        quantity: { $sum: "$items.quantity" },
        orders:   { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);

  return successResponse(res, { categories: data }, "Top categories fetched.");
});

// ─── Sales by Country ─────────────────────────────────────────────────────────

export const getSalesByCountry = asyncHandler(async (req, res) => {
  const data = await Order.aggregate([
    { $match: { "payment.status": "paid" } },
    {
      $group: {
        _id:     "$shippingAddress.country",
        revenue: { $sum: "$total" },
        orders:  { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 20 },
  ]);

  return successResponse(res, { countries: data }, "Sales by country fetched.");
});

// ─── Customer Retention ───────────────────────────────────────────────────────

export const getCustomerRetention = asyncHandler(async (req, res) => {
  const totalCustomers = await User.countDocuments({ role: "customer" });

  const repeatCustomers = await Order.aggregate([
    {
      $group: {
        _id:    "$customer",
        count:  { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $count: "total" },
  ]);

  const repeatCount = repeatCustomers[0]?.total || 0;
  const retentionRate = totalCustomers
    ? Math.round((repeatCount / totalCustomers) * 100)
    : 0;

  // New vs returning by month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const newCustomers = await User.aggregate([
    { $match: { role: "customer", createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id:   { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return successResponse(res, {
    retention: {
      totalCustomers,
      repeatCustomers: repeatCount,
      retentionRate,
    },
    newCustomersByMonth: newCustomers,
  }, "Customer retention fetched.");
});

// ─── Conversion Funnel ────────────────────────────────────────────────────────

export const getConversionFunnel = asyncHandler(async (req, res) => {
  const [totalVisits, ordersPlaced, ordersPaid] = await Promise.all([
    Product.aggregate([{ $group: { _id: null, views: { $sum: "$viewCount" } } }]),
    Order.countDocuments(),
    Order.countDocuments({ "payment.status": "paid" }),
  ]);

  const visits    = totalVisits[0]?.views || 1;
  const placed    = ordersPlaced;
  const paid      = ordersPaid;
  const convRate  = Math.round((paid / visits) * 100 * 100) / 100;

  return successResponse(res, {
    funnel: {
      productViews:   visits,
      ordersPlaced:   placed,
      ordersPaid:     paid,
      conversionRate: convRate,
    },
  }, "Conversion funnel fetched.");
});

// ─── Comprehensive Dashboard (For UI) ─────────────────────────────────────────

export const getComprehensiveDashboard = asyncHandler(async (req, res) => {
  const today = new Date(); 
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  // Execute all queries in parallel
  const [
    // 1. KPI Stats
    todayRevenueAgg,
    weekRevenueAgg,
    monthRevenueAgg,
    lastMonthRevenueAgg,
    todayOrders,
    monthOrders,
    lastMonthOrders,
    pendingOrders,
    totalProducts,
    returns,
    pendingRefunds,
    complaints, // 1-2 star reviews
    
    // 2. Sales Chart (Monthly for current year)
    salesChartAgg,

    // 3. Order Status Donut Chart
    orderStatusAgg,

    // 4. Recent Orders Table (limit 5)
    recentOrders,

    // 5. Low Stock Alert (stock <= 5)
    lowStockProducts,

    // 6. Best Selling Products (Top 5 by revenue)
    bestSellingAgg,

    // 7. Inventory Overview (In Stock, Low Stock, Out of Stock)
    inventoryOverviewAgg
  ] = await Promise.all([
    // Revenue
    Order.aggregate([ { $match: { createdAt: { $gte: today }, "payment.status": "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } } ]),
    Order.aggregate([ { $match: { createdAt: { $gte: weekStart }, "payment.status": "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } } ]),
    Order.aggregate([ { $match: { createdAt: { $gte: monthStart }, "payment.status": "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } } ]),
    Order.aggregate([ { $match: { createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }, "payment.status": "paid" } }, { $group: { _id: null, total: { $sum: "$total" } } } ]),
    
    // Orders
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.countDocuments({ createdAt: { $gte: monthStart } }),
    Order.countDocuments({ createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
    Order.countDocuments({ status: "pending" }),
    
    // Products & Returns & Complaints & Refunds
    Product.countDocuments({ status: { $ne: "archived" } }),
    Order.countDocuments({ status: { $in: ["returned", "refunded"] } }),
    Order.countDocuments({ "refund.status": "Pending" }),
    Complaint.countDocuments({ status: "Open" }),

    // Sales Chart
    Order.aggregate([
      { $match: { createdAt: { $gte: yearStart }, "payment.status": "paid" } },
      { $group: { _id: { month: { $month: "$createdAt" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
      { $sort: { "_id.month": 1 } }
    ]),

    // Order Status
    Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),

    // Recent Orders
    Order.find().sort({ createdAt: -1 }).limit(5).select("orderNumber status total createdAt customerSnapshot payment"),

    // Low Stock Alert
    Product.find({ stock: { $lte: 5 }, status: { $ne: "archived" } }).select("name sku stock mainImage").limit(10),

    // Best Selling Products
    Order.aggregate([
      { $match: { "payment.status": "paid" } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.name" }, revenue: { $sum: "$items.totalPrice" }, sales: { $sum: "$items.quantity" } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 }
    ]),

    // Inventory Overview
    Product.aggregate([
      { $match: { status: { $ne: "archived" } } },
      { $group: {
          _id: null,
          total: { $sum: 1 },
          outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } },
          lowStock: { $sum: { $cond: [{ $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", 5] }] }, 1, 0] } },
          inStock: { $sum: { $cond: [{ $gt: ["$stock", 5] }, 1, 0] } }
        }
      }
    ])
  ]);

  // Extract Data
  const todayRevenue = todayRevenueAgg[0]?.total || 0;
  const thisWeekRevenue = weekRevenueAgg[0]?.total || 0;
  const thisMonthRevenue = monthRevenueAgg[0]?.total || 0;
  const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0;

  const revenueTrend = lastMonthRevenue ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 100;
  const ordersTrend = lastMonthOrders ? Math.round(((monthOrders - lastMonthOrders) / lastMonthOrders) * 100) : 100;
  
  // Format Sales Chart
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const salesChart = salesChartAgg.map(item => ({
    name: monthNames[item._id.month - 1],
    sales: item.revenue,
    orders: item.orders
  }));

  // Ensure 12 months for chart (fill missing with 0)
  const fullSalesChart = [];
  for (let i = 0; i < today.getMonth() + 1; i++) {
    const existing = salesChart.find(s => s.name === monthNames[i]);
    if (existing) fullSalesChart.push(existing);
    else fullSalesChart.push({ name: monthNames[i], sales: 0, orders: 0 });
  }

  // Format Order Status Chart
  const orderStatusMap = {
    delivered: { name: "Delivered", color: "var(--color-success)" },
    pending: { name: "Pending", color: "var(--color-warning)" },
    shipped: { name: "Shipped", color: "var(--color-info)" },
    cancelled: { name: "Cancelled", color: "var(--color-danger)" },
    processing: { name: "Processing", color: "var(--color-info)" }
  };
  
  const orderStatusData = orderStatusAgg.map(item => {
    const status = item._id.toLowerCase();
    return {
      name: orderStatusMap[status]?.name || item._id,
      value: item.count,
      color: orderStatusMap[status]?.color || "var(--text-secondary)"
    };
  });

  // Inventory Stats
  const invStats = inventoryOverviewAgg[0] || { total: 0, outOfStock: 0, lowStock: 0, inStock: 0 };
  const inventoryOverview = {
    inStockPercent: invStats.total ? Math.round((invStats.inStock / invStats.total) * 100) : 0,
    lowStockPercent: invStats.total ? Math.round((invStats.lowStock / invStats.total) * 100) : 0,
    outOfStockPercent: invStats.total ? Math.round((invStats.outOfStock / invStats.total) * 100) : 0
  };

  // Best Selling calculation (max revenue for percentage bar)
  const maxRevenue = bestSellingAgg.length > 0 ? bestSellingAgg[0].revenue : 1;
  const bestSelling = bestSellingAgg.map(p => ({
    id: p._id,
    name: p.name,
    sales: p.sales,
    revenue: p.revenue,
    percentage: Math.round((p.revenue / maxRevenue) * 100)
  }));

  return successResponse(res, {
    kpi: {
      totalRevenue: thisMonthRevenue,
      revenueTrend,
      todayOrders,
      ordersTrend,
      pendingOrders,
      totalProducts,
      lowStockCount: invStats.lowStock,
      returns,
      pendingRefunds,
      complaints
    },
    salesChart: fullSalesChart,
    orderStatusChart: orderStatusData,
    recentOrders,
    lowStockProducts: lowStockProducts.map(p => ({
      id: p._id,
      name: p.name,
      sku: p.sku,
      stock: p.stock,
      threshold: 5,
      mainImage: p.mainImage
    })),
    bestSelling,
    revenueSummary: {
      today: todayRevenue,
      thisWeek: thisWeekRevenue,
      thisMonth: thisMonthRevenue
    },
    inventoryOverview
  }, "Comprehensive Dashboard Data Fetched.");
});
