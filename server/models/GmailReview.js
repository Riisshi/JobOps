const mongoose = require("mongoose");

const gmailReviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
      index: true,
    },
    messageId: { type: String, required: true },
    from: { type: String, default: "" },
    subject: { type: String, default: "" },
    snippet: { type: String, default: "" },
    confidence: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "ignored"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

gmailReviewSchema.index({ user: 1, messageId: 1 }, { unique: true });

module.exports = mongoose.model("GmailReview", gmailReviewSchema);
