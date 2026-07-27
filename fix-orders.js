import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model("Order", orderSchema);

async function fixOrders() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");

    const result = await Order.updateMany(
      { "payment.method": "razorpay", "payment.status": "pending" },
      { $set: { "payment.status": "paid" } }
    );
    console.log(`Updated ${result.modifiedCount} orders.`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from DB");
  }
}

fixOrders();
