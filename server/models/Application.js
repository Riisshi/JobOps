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
  followUpCount: {
    type: Number,
    default: 0
  },
  outreachTrackingToken: {
    type: String,
    default: "",
  },
  lastFollowUpSent: {
    type: Date
  },
  interviewDate: {
    type: Date,
  },
  interviewStage: {
    type: String,
    enum: ["", "hr", "technical", "final", "other"],
    default: "",
  },
  jobLink: {
    type: String,
    default: "",
  },
  resumeName: {
    type: String,
    default: "",
  },
  resumeLink: {
    type: String,
    default: "",
  },
  coverLetterLink: {
    type: String,
    default: "",
  },
  notes: {
    type: String,
  },
  priority: {
    type: String,
    enum: ["high", "medium", "low"],
    default: "low",
  },
  history: {
    type: [
      {
        action: { type: String, required: true },
        details: { type: String },
        date: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Application", applicationSchema);
