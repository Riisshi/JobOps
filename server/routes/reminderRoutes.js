const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
} = require("../controllers/reminderController");

router.get("/", auth, getReminders);
router.post("/", auth, createReminder);
router.put("/:id", auth, updateReminder);
router.delete("/:id", auth, deleteReminder);

module.exports = router;
