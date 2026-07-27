import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import express from "express";
import cors from "cors";
import morgan from "morgan";

import connectDB from "./config/db.js";

import productRouter from "./routes/product.routes.js";
import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import categoryRouter from "./routes/category.route.js";
import collectionRouter from "./routes/collection.route.js";
import orderRouter from "./routes/order.route.js";
import reviewRouter from "./routes/review.route.js";
import couponRouter from "./routes/coupon.route.js";
import blogRouter from "./routes/blog.route.js";
import artisanRouter from "./routes/artisan.route.js";
import inventoryRouter from "./routes/inventory.route.js";
import analyticsRouter from "./routes/analytics.route.js";
import mediaRouter from "./routes/media.route.js";
import notificationRouter from "./routes/notification.route.js";
import cmsRouter from "./routes/cms.route.js";
import auditLogRouter from "./routes/auditLog.route.js";
import paymentRouter from "./routes/payment.routes.js";
import complaintRouter from "./routes/complaint.route.js";
import refundRouter from "./routes/refund.route.js";
import { sendError } from "./utils/helpers.js";

const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// __dirname equivalent for ES Modules
// ─────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─────────────────────────────────────────────
// Security & utility middleware
// ─────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// HTTP request logger (compact in production, coloured in dev)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─────────────────────────────────────────────
// Ensure the uploads directory exists on startup
// ─────────────────────────────────────────────
const UPLOAD_DIR = path.resolve("uploads/products");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created upload directory: ${UPLOAD_DIR}`);
}

// ─────────────────────────────────────────────
// Static file serving — uploaded product images
// Accessible at: GET /uploads/products/<filename>
// ─────────────────────────────────────────────
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Artistic Carpets API is running 🚀",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ success: true, status: "OK", uptime: process.uptime() });
});

import damageRouter from "./routes/damage.route.js";
// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api", productRouter);        // exposes /api/products & /api/admin/products
app.use("/api/users", userRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/collections", collectionRouter);
app.use("/api/orders", orderRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/coupons", couponRouter);
app.use("/api/blogs", blogRouter);
app.use("/api/artisans", artisanRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/media", mediaRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/cms", cmsRouter);
app.use("/api/audit-logs", auditLogRouter);
app.use("/api/complaints", complaintRouter);
app.use("/api/refunds", refundRouter);
app.use("/api/damaged-inventory", damageRouter);
// ─────────────────────────────────────────────
// 404 handler — catches unmatched routes
// ─────────────────────────────────────────────
app.use((req, res) => {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
});

// ─────────────────────────────────────────────
// Global error handler — catches next(err) calls
// ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  const statusCode = err.statusCode || err.status || 500;
  sendError(
    res,
    statusCode,
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred."
      : err.message
  );
});

// ─────────────────────────────────────────────
// Connect to MongoDB, then start HTTP server
// ─────────────────────────────────────────────
const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`\n🚀 Server running in ${process.env.NODE_ENV || "development"} mode`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api/products\n`);
    });

    // ── Graceful shutdown ──────────────────────
    const shutdown = (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(() => {
        console.log("✅ HTTP server closed.");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // ── Unhandled promise rejection guard ──────
    process.on("unhandledRejection", (err) => {
      console.error("❌ Unhandled Rejection:", err.message);
      server.close(() => process.exit(1));
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();// Trigger restart
