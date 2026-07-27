import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "./models/order.model.js";
import Product from "./models/product.model.js";
import User from "./models/user.model.js";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    process.exit(1);
  }
};

const seedOrders = async () => {
  await connectDB();

  try {
    // 1. Get some products
    const products = await Product.find({}).limit(5);
    if (products.length === 0) {
      console.log("No products found in DB. Please seed products first.");
      process.exit(1);
    }

    // 1.5 Get a user
    let user = await User.findOne({ role: "customer" }) || await User.findOne({});
    if (!user) {
      user = await User.create({
        firstName: "Alexander",
        lastName: "Sterling",
        email: "alexander@example.com",
        password: "password123",
        role: "customer"
      });
      console.log("Created dummy user.");
    }

    // 2. Clear existing orders (optional, but good for testing)
    await Order.deleteMany({});
    console.log("Cleared existing orders.");

    // 3. Create dummy orders
    const statuses = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
    
    const dummyOrders = [];
    
    for (let i = 0; i < 8; i++) {
      const product = products[i % products.length];
      const status = statuses[i % statuses.length];
      const qty = Math.floor(Math.random() * 3) + 1;
      const unitPrice = product.price || 1500;
      
      const order = {
        orderNumber: `ORD-${Math.floor(Math.random() * 1000000)}`,
        customer: user._id,
        customerSnapshot: {
          name: i % 2 === 0 ? "Alexander Sterling" : "Eleanor Vance",
          email: i % 2 === 0 ? "alexander@example.com" : "eleanor@example.com",
          phone: "+1 555-0198"
        },
        items: [
          {
            product: product._id,
            name: product.title || "Artistic Carpet",
            image: product.thumbnail?.path || "",
            sku: product.sku || `SKU-${Math.floor(Math.random() * 1000)}`,
            quantity: qty,
            unitPrice: unitPrice,
            totalPrice: unitPrice * qty,
            size: "8x10",
            material: "Wool"
          }
        ],
        subtotal: unitPrice * qty,
        total: unitPrice * qty + 20, // + 20 delivery
        shippingCost: 20,
        taxAmount: 0,
        status: status,
        payment: {
          method: "razorpay",
          status: i === 0 ? "pending" : "paid",
          amount: unitPrice * qty + 20
        },
        shippingAddress: {
          firstName: i % 2 === 0 ? "Alexander" : "Eleanor",
          lastName: i % 2 === 0 ? "Sterling" : "Vance",
          addressLine1: "123 Heritage Way",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "USA"
        },
        timeline: [
          {
            status: "pending",
            message: "Order placed successfully",
            timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          }
        ],
        refund: i === 0 
          ? { status: "Pending", requestedAt: new Date(), reason: "Defective", comment: "Item was torn." }
          : (i === 1 
              ? { status: "Refunded", requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), completedAt: new Date(), reason: "Not as described", comment: "Color looks different." } 
              : { status: "None" })
      };
      
      if (status !== "pending") {
        order.timeline.push({
          status: "confirmed",
          message: "Payment verified and order confirmed",
          timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
        });
      }
      
      if (status === "shipped" || status === "out_for_delivery" || status === "delivered") {
        order.shipping = {
          carrier: "FedEx",
          trackingNumber: `FX${Math.floor(Math.random() * 1000000000)}`,
          shippedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        };
      }

      dummyOrders.push(order);
    }

    await Order.insertMany(dummyOrders);
    console.log("Successfully seeded 8 dummy orders.");

  } catch (error) {
    console.error("Seeding Error:", error);
  } finally {
    process.exit(0);
  }
};

seedOrders();
