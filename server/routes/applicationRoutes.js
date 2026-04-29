const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  createApplication,
  getApplications,
  updateStatus,
  updateNotes,
  generateFollowUp,
  sendFollowUp,
  getStats,
  getStreak,
  deleteApplication,
  updateInterviewDate,
  getApplicationById,
  updateApplicationDetails,
  getIntelligence,
  exportApplicationsCsv,
  exportApplicationsPdfReport,
} = require("../controllers/applicationController");

router.get("/", auth, getApplications);
router.post("/", auth, createApplication);
router.get("/stats", auth, getStats);
router.get("/streak", auth, getStreak);
router.get("/intelligence", auth, getIntelligence);
router.get("/export/csv", auth, exportApplicationsCsv);
router.get("/export/report", auth, exportApplicationsPdfReport);
router.get("/:id", auth, getApplicationById);

router.put("/:id/status", auth, updateStatus);
router.put("/:id/notes", auth, updateNotes);
router.put("/:id/interview", auth, updateInterviewDate);
router.put("/:id/details", auth, updateApplicationDetails);
router.delete("/:id", auth, deleteApplication);
router.post("/:id/followup", auth, generateFollowUp);
router.post("/:id/send-followup", auth, sendFollowUp);


module.exports = router;
