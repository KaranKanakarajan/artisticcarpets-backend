import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/user.model.js";

dotenv.config();

const ensureAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    let admin = await User.findOne({ email: "admin@artisticcarpets.com" });
    if (!admin) {
      admin = await User.create({
        name: "Super Admin",
        firstName: "Super",
        lastName: "Admin",
        email: "admin@artisticcarpets.com",
        password: "Admin@123",
        role: "super_admin",
        isEmailVerified: true
      });
      console.log("Admin user created.");
    } else {
      console.log("Admin user already exists.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
};

ensureAdmin();
