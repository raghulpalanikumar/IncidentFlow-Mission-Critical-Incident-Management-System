/**
 * Incident Model
 * MongoDB schema for incidents
 */

const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "investigating", "resolved", "closed"],
      default: "open",
    },
    source: {
      type: String,
      required: true,
    },
    signals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Signal",
      },
    ],
    rca: {
      startAt: Date,
      endAt: Date,
      description: String,
      rootCause: String,
      actionItems: [String],
      validatedAt: Date,
    },
    timeline: {
      openedAt: {
        type: Date,
        default: Date.now,
      },
      acknowledgedAt: Date,
      resolvedAt: Date,
    },
    assignee: String,
    tags: [String],
    metrics: {
      mttr: Number, // Mean Time To Resolution in seconds
      detectionTime: Number,
      resolution: String,
    },
  },
  { timestamps: true }
);

// Index for faster queries
incidentSchema.index({ status: 1, severity: 1 });
incidentSchema.index({ "timeline.openedAt": -1 });
incidentSchema.index({ source: 1 });

// Calculate MTTR on save
incidentSchema.pre("save", function () {
  if (this.timeline?.resolvedAt && this.timeline?.openedAt) {
    const mttr = (this.timeline.resolvedAt - this.timeline.openedAt) / 1000; // seconds
    if (!this.metrics) this.metrics = {};
    this.metrics.mttr = mttr;
  }
});

// Validate RCA
incidentSchema.methods.validateRCA = function () {
  if (!this.rca) return false;
  return (
    this.rca.startAt &&
    this.rca.endAt &&
    this.rca.description &&
    this.rca.rootCause &&
    this.rca.actionItems &&
    this.rca.actionItems.length > 0
  );
};

module.exports = mongoose.model("Incident", incidentSchema);
