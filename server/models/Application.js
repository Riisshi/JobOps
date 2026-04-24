const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  company: { type: String, required: true },
  role: { type: String, required: true },
  email: { type: String },
  status: {
    type: String,
    enum: ["applied", "interview", "rejected", "offer"],
    default: "applied",
  },
  appliedDate: {
    type: Date,
    default: Date.now,
  },
  lastActionDate: {
  type: Date,
  default: Date.now,
  },
  nextFollowUpDate: {
    type: Date,
  },
  notes: {
    type: String,
  },
});

module.exports = mongoose.model("Application", applicationSchema);