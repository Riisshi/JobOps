const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, default: "" }, // Local auth only; OAuth users may not have password
  authProvider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },
  googleId: { type: String, default: "" },
  phone: { type: String, default: "" },
  location: { type: String, default: "" },
  targetRole: { type: String, default: "" },
  linkedinUrl: { type: String, default: "" },
  portfolioUrl: { type: String, default: "" },
  timezone: { type: String, default: "" },
  shareToken: { type: String, default: "" },
  integrations: {
    gmailConnected: { type: Boolean, default: false },
    gmailAccountEmail: { type: String, default: "" },
    gmailOAuth: {
      accessToken: { type: String, default: "" },
      refreshToken: { type: String, default: "" },
      expiryDate: { type: Date },
    },
    gmailProcessedMessageIds: { type: [String], default: [] },
    gmailLastSync: {
      at: { type: Date },
      scanned: { type: Number, default: 0 },
      matched: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      needsReview: { type: Number, default: 0 },
      unmatched: { type: Number, default: 0 },
      status: { type: String, default: "" },
      error: { type: String, default: "" },
    },
  },
  gamification: {
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    milestones: { type: [String], default: [] },
    lastXpAt: { type: Date },
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
