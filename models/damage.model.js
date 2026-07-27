import mongoose from "mongoose";

const damageInventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1."],
    },
    damageReason: {
      type: String,
      enum: [
        "Manufacturing Defect",
        "Water Damage",
        "Torn",
        "Color Fade",
        "Transport Damage",
        "Customer Return",
        "Pest Damage",
        "Other"
      ],
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageUrl: {
      type: String, // Just text for now as per user request
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "Pending Inspection",
        "Repairable",
        "Under Repair",
        "Repaired",
        "Disposed",
        "Returned to Supplier"
      ],
      default: "Pending Inspection",
    },
    actionLog: [
      {
        action: String,
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        date: { type: Date, default: Date.now },
        notes: String,
      }
    ]
  },
  { timestamps: true }
);

// Indexes for faster dashboard queries
damageInventorySchema.index({ status: 1 });
damageInventorySchema.index({ damageReason: 1 });
damageInventorySchema.index({ createdAt: -1 });

const DamageInventory = mongoose.model("DamageInventory", damageInventorySchema);
export default DamageInventory;
