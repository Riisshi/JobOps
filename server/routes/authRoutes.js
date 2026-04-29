const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { register, login, getMe, updateMe, getGoogleAuthUrl, googleAuthCallback } = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.get("/google/url", getGoogleAuthUrl);
router.get("/google/callback", googleAuthCallback);
router.get("/me", auth, getMe);
router.put("/me", auth, updateMe);

module.exports = router;
