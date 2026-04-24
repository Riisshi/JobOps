const express = require("express");
const router = express.Router();
const {
  createApplication,
  getApplications,
  updateStatus,
  generateFollowUp,
  sendFollowUp,
  getStats,
  getStreak,
} = require("../controllers/applicationController");

router.post("/", createApplication);
router.get("/", getApplications);
router.get("/stats", getStats);
router.get("/streak", getStreak);
router.put("/:id/status", updateStatus);
router.post("/:id/followup", generateFollowUp);
router.post("/:id/send-followup", sendFollowUp);


module.exports = router;