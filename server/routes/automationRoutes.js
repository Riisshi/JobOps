const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getGamification,
  getMarketIntelligence,
  runAutoFollowUps,
  processDueReminders,
  getIntegrationStatus,
  updateIntegrationSettings,
  generateShareToken,
  getExternalAutomationHints,
  getGmailAuthUrl,
  gmailOAuthCallback,
  syncGmailReplies,
  getGmailReviews,
  confirmGmailReview,
  ignoreGmailReview,
} = require("../controllers/automationController");

router.get("/gmail/callback", gmailOAuthCallback);
router.get("/gmail/auth-url", auth, getGmailAuthUrl);
router.post("/gmail/sync-replies", auth, syncGmailReplies);
router.get("/gmail/reviews", auth, getGmailReviews);
router.post("/gmail/reviews/:id/confirm", auth, confirmGmailReview);
router.post("/gmail/reviews/:id/ignore", auth, ignoreGmailReview);
router.get("/gamification", auth, getGamification);
router.get("/market-intelligence", auth, getMarketIntelligence);
router.post("/auto-followups/run", auth, runAutoFollowUps);
router.post("/notifications/process-due", auth, processDueReminders);
router.get("/integrations", auth, getIntegrationStatus);
router.put("/integrations", auth, updateIntegrationSettings);
router.post("/share-token", auth, generateShareToken);
router.get("/hints/:id", auth, getExternalAutomationHints);

module.exports = router;
