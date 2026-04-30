/**
 * Signal Model
 * MongoDB schema for signals
 */

const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
    incident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
    },
    processed: {
      type: Boolean,
      default: false,
    },
    processingTime: Number, // milliseconds
  },
  { timestamps: true }
);

// Index for faster queries
signalSchema.index({ source: 1, createdAt: -1 });
signalSchema.index({ incident: 1 });
signalSchema.index({ processed: 1 });

module.exports = mongoose.model("Signal", signalSchema);
