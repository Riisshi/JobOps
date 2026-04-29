const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userProjection = "name email phone location targetRole linkedinUrl portfolioUrl timezone";
const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || "",
  location: user.location || "",
  targetRole: user.targetRole || "",
  linkedinUrl: user.linkedinUrl || "",
  portfolioUrl: user.portfolioUrl || "",
  timezone: user.timezone || "",
});

const issueAuthToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const getFrontendBase = () => process.env.FRONTEND_URL || "http://localhost:3000";

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = issueAuthToken(user._id);
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Invalid Credentials" });
    if (!user.password) {
      return res.status(400).json({ msg: "This account uses Google sign-in. Continue with Google." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid Credentials" });

    const token = issueAuthToken(user._id);
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

exports.getGoogleAuthUrl = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri =
      process.env.GOOGLE_AUTH_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
    if (!clientId) return res.status(400).json({ error: "Missing GOOGLE_CLIENT_ID." });

    const mode = req.query.mode === "register" ? "register" : "login";
    const state = Buffer.from(JSON.stringify({ mode, ts: Date.now() })).toString("base64url");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    res.json({ authUrl: `${GOOGLE_OAUTH_BASE}?${params.toString()}`, redirectUri });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.googleAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Missing code/state.");

    const parsedState = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));
    const mode = parsedState?.mode === "register" ? "register" : "login";
    const redirectUri =
      process.env.GOOGLE_AUTH_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/auth/google/callback`;

    const tokenBody = new URLSearchParams({
      code: String(code),
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(400).send(`Google token exchange failed: ${tokenData.error || "unknown error"}`);
    }

    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await userInfoRes.json();
    if (!userInfoRes.ok || !profile?.email) {
      return res.status(400).send("Could not fetch Google profile.");
    }

    let user = await User.findOne({ email: profile.email.toLowerCase() });
    if (!user) {
      user = await User.create({
        name: profile.name || profile.given_name || "Google User",
        email: profile.email.toLowerCase(),
        password: "",
        authProvider: "google",
        googleId: profile.sub || "",
      });
    } else if (!user.googleId && profile.sub) {
      user.googleId = profile.sub;
      if (!user.authProvider) user.authProvider = "google";
      await user.save();
    }

    const token = issueAuthToken(user._id);
    const frontendTarget = `${getFrontendBase()}/${mode}?oauth=success&token=${encodeURIComponent(token)}`;
    return res.redirect(frontendTarget);
  } catch (err) {
    const fallback = `${getFrontendBase()}/login?oauth=error&message=${encodeURIComponent(err.message || "OAuth failed")}`;
    return res.redirect(fallback);
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(userProjection);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const allowed = [
      "name",
      "phone",
      "location",
      "targetRole",
      "linkedinUrl",
      "portfolioUrl",
      "timezone",
    ];
    const updates = {};

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
    });

    if (!updates.name) {
      return res.status(400).json({ error: "Name is required." });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select(userProjection);

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Server Error" });
  }
};
