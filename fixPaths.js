import "dotenv/config";
import mongoose from "mongoose";
import Product from "./models/product.model.js";
import connectDB from "./config/db.js";

const fixPaths = async () => {
  await connectDB();
  console.log("Connected to DB, looking for bad paths...");

  const products = await Product.find({});
  let updatedCount = 0;

  for (const product of products) {
    let changed = false;

    if (product.thumbnail && product.thumbnail.path && product.thumbnail.path.includes("C:/")) {
      const idx = product.thumbnail.path.indexOf("/uploads/");
      if (idx !== -1) {
        product.thumbnail.path = product.thumbnail.path.substring(idx);
        changed = true;
      }
    }

    if (product.images && product.images.length > 0) {
      product.images.forEach(img => {
        if (img.path && img.path.includes("C:/")) {
          const idx = img.path.indexOf("/uploads/");
          if (idx !== -1) {
            img.path = img.path.substring(idx);
            changed = true;
          }
        }
      });
    }

    if (changed) {
      await product.save();
      console.log(`Fixed product: ${product.title}`);
      updatedCount++;
    }
  }

  console.log(`Done! Fixed ${updatedCount} products.`);
  process.exit(0);
};

fixPaths();
