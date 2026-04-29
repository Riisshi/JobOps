const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
  title: { type: String, required: true },
  note: { type: String, default: "" },
  type: {
    type: String,
    enum: ["follow-up", "interview", "prep", "custom"],
    default: "custom",
  },
  dueDate: { type: Date, required: true },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Reminder", reminderSchema);
