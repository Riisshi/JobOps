const crypto = require("crypto");
const Application = require("../models/Application");
const Reminder = require("../models/Reminder");
const User = require("../models/User");
const GmailReview = require("../models/GmailReview");
const sendEmail = require("../utils/emailService");

const DAY_MS = 1000 * 60 * 60 * 24;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysBetween = (fromDate, toDate = new Date()) => {
  if (!fromDate) return 0;
  return Math.floor((new Date(toDate) - new Date(fromDate)) / DAY_MS);
};

const levelForXp = (xp) => Math.max(1, Math.floor((xp || 0) / 100) + 1);
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const TRACKING_TOKEN_REGEX = /\[(JO-[A-Za-z0-9-]+)\]/i;

const computeMilestones = (apps, followUpsSent, offers) => {
  const milestones = [];
  if (apps.length >= 10) milestones.push("10 Applications");
  if (apps.length >= 50) milestones.push("50 Applications");
  if (followUpsSent >= 10) milestones.push("10 Follow-ups");
  if (offers >= 1) milestones.push("First Offer");
  if (offers >= 3) milestones.push("3 Offers");
  return milestones;
};

const refreshGmailAccessTokenIfNeeded = async (user) => {
  const oauth = user?.integrations?.gmailOAuth;
  if (!oauth?.accessToken) return null;

  const expiresAt = oauth.expiryDate ? new Date(oauth.expiryDate).getTime() : 0;
  const needsRefresh = !expiresAt || expiresAt <= Date.now() + 60 * 1000;
  if (!needsRefresh) return oauth.accessToken;
  if (!oauth.refreshToken) return oauth.accessToken;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: oauth.refreshToken,
    grant_type: "refresh_token",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    user.integrations.gmailConnected = false;
    user.integrations.gmailOAuth.accessToken = "";
    await user.save();
    return null;
  }

  user.integrations.gmailOAuth.accessToken = tokenData.access_token;
  user.integrations.gmailOAuth.expiryDate = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : oauth.expiryDate;
  await user.save();
  return tokenData.access_token;
};

exports.getGamification = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id });
    const offers = apps.filter((a) => a.status === "offer").length;
    const interviews = apps.filter((a) => a.status === "interview").length;
    const followUpsSent = apps.reduce((sum, app) => sum + (app.followUpCount || 0), 0);

    const xp = apps.length * 8 + interviews * 20 + offers * 80 + followUpsSent * 5;
    const level = levelForXp(xp);
    const milestones = computeMilestones(apps, followUpsSent, offers);

    const user = await User.findById(req.user.id);
    if (user) {
      user.gamification = {
        xp,
        level,
        milestones,
        lastXpAt: new Date(),
      };
      await user.save();
    }

    res.json({
      xp,
      level,
      milestones,
      nextLevelAt: level * 100,
      progressToNext: Math.min(100, Math.round(((xp - (level - 1) * 100) / 100) * 100)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMarketIntelligence = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id });
    const roleMap = {};

    apps.forEach((app) => {
      const role = (app.role || "Unknown").trim().toLowerCase();
      if (!roleMap[role]) {
        roleMap[role] = { role: app.role || "Unknown", total: 0, responses: 0, offers: 0 };
      }
      roleMap[role].total += 1;
      if (app.status === "interview" || app.status === "offer") roleMap[role].responses += 1;
      if (app.status === "offer") roleMap[role].offers += 1;
    });

    const roleTrends = Object.values(roleMap)
      .map((item) => ({
        ...item,
        responseRate: item.total ? Number(((item.responses / item.total) * 100).toFixed(1)) : 0,
        offerRate: item.total ? Number(((item.offers / item.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.responseRate - a.responseRate || b.total - a.total);

    const topRole = roleTrends[0] || null;
    const insights = [];
    if (topRole) {
      insights.push(`Best performing role track: ${topRole.role} (${topRole.responseRate}% response rate).`);
    }
    const lowPerforming = roleTrends.filter((r) => r.total >= 3 && r.responseRate < 10);
    if (lowPerforming.length) {
      insights.push(`Low-conversion role buckets detected: ${lowPerforming.map((r) => r.role).join(", ")}.`);
    }

    res.json({
      roleTrends,
      insights,
      note: "Role trends are computed from your own pipeline data. External market feeds can be connected later.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.runAutoFollowUps = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const today = startOfDay(new Date());
    const apps = await Application.find({ user: req.user.id, status: "applied" });

    let sent = 0;
    const results = [];

    for (const app of apps) {
      const followUpCount = app.followUpCount || 0;
      const isFirstFollowUp = followUpCount === 0 && !app.lastFollowUpSent;
      const due =
        isFirstFollowUp ||
        (app.nextFollowUpDate && startOfDay(app.nextFollowUpDate).getTime() <= today.getTime());

      if (!due || !app.email || followUpCount >= 3) continue;

      const followUpNum = followUpCount + 1;
      const senderName = user.name || user.email.split("@")[0];
      const message = `Hi,\n\nFollowing up on my ${app.role} application at ${app.company}. I remain very interested and wanted to check for updates.\n\nThanks,\n${senderName}`;
      await sendEmail(
        app.email,
        `Auto follow-up #${followUpNum}: ${app.role} at ${app.company}`,
        message
      );

      app.followUpCount = followUpNum;
      app.lastFollowUpSent = new Date();
      app.lastActionDate = new Date();
      if (!app.history) app.history = [];
      app.history.push({
        action: "auto-follow-up",
        details: `Auto-sent follow-up #${followUpNum}`,
        date: new Date(),
      });

      if (followUpNum >= 3) {
        app.nextFollowUpDate = null;
      } else {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + (followUpNum === 1 ? 3 : 5));
        app.nextFollowUpDate = nextDate;
      }
      await app.save();
      sent += 1;
      results.push({ id: app._id, company: app.company, role: app.role, followUpNum });
    }

    res.json({ sent, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.processDueReminders = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const now = new Date();
    const due = await Reminder.find({
      user: req.user.id,
      completed: false,
      dueDate: { $lte: now },
    }).sort({ dueDate: 1 });

    if (!due.length) return res.json({ sent: 0, reminders: [] });

    const summary = due
      .map((r) => `- ${r.title} (${r.type}) due ${new Date(r.dueDate).toLocaleDateString()}`)
      .join("\n");

    await sendEmail(
      user.email,
      `JobOps reminders: ${due.length} due`,
      `You have ${due.length} due reminder(s):\n\n${summary}`
    );

    res.json({
      sent: 1,
      reminders: due.map((r) => ({ id: r._id, title: r.title, dueDate: r.dueDate })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getIntegrationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("integrations");
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({
      gmail: {
        connected: !!user.integrations?.gmailConnected,
        accountEmail: user.integrations?.gmailAccountEmail || "",
        tokenExpiresAt: user.integrations?.gmailOAuth?.expiryDate || null,
        hasRefreshToken: !!user.integrations?.gmailOAuth?.refreshToken,
        lastSync: user.integrations?.gmailLastSync || null,
      },
      fallback: {
        smartSuggestions: "enabled",
        status: "Using rule-based suggestions (free mode).",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateIntegrationSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const updates = req.body || {};
    const current = user.integrations || {};
    user.integrations = {
      ...current,
      gmailConnected: !!updates.gmailConnected,
      gmailAccountEmail: updates.gmailAccountEmail || current.gmailAccountEmail || "",
      gmailOAuth: current.gmailOAuth || {},
    };
    await user.save();
    res.json({ success: true, integrations: user.integrations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGmailAuthUrl = async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/automation/gmail/callback`;
    if (!clientId || !redirectUri) {
      return res.status(400).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI." });
    }

    const state = Buffer.from(`${req.user.id}:${Date.now()}`).toString("base64url");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: GMAIL_SCOPES.join(" "),
      state,
    });

    res.json({ authUrl: `${GOOGLE_OAUTH_BASE}?${params.toString()}`, redirectUri });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.gmailOAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).send("Missing code/state.");
    }

    const decoded = Buffer.from(String(state), "base64url").toString("utf8");
    const userId = decoded.split(":")[0];
    if (!userId) return res.status(400).send("Invalid state.");

    const user = await User.findById(userId);
    if (!user) return res.status(404).send("User not found.");

    const body = new URLSearchParams({
      code: String(code),
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).send(`OAuth token exchange failed: ${tokenData.error || "unknown error"}`);
    }

    const meRes = await fetch(GMAIL_PROFILE_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const meData = await meRes.json();

    user.integrations = user.integrations || {};
    user.integrations.gmailConnected = true;
    user.integrations.gmailAccountEmail = meData.emailAddress || user.email;
    user.integrations.gmailOAuth = {
      accessToken: tokenData.access_token || "",
      refreshToken: tokenData.refresh_token || user.integrations.gmailOAuth?.refreshToken || "",
      expiryDate: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
    };
    await user.save();

    res.send("Gmail connected successfully. You can close this tab and return to JobOps.");
  } catch (err) {
    res.status(500).send(`Gmail OAuth callback failed: ${err.message}`);
  }
};

exports.syncGmailReplies = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    const accessToken = await refreshGmailAccessTokenIfNeeded(user);
    if (!accessToken) {
      return res.status(400).json({ error: "Gmail not connected. Connect Gmail first." });
    }

    const listUrl = `${GMAIL_MESSAGES_URL}?maxResults=30&q=newer_than:30d`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listData = await listRes.json();
    if (!listRes.ok) {
      return res.status(400).json({ error: listData.error?.message || "Failed to read Gmail messages." });
    }

    const messages = listData.messages || [];
    const apps = await Application.find({ user: req.user.id });
    let matched = 0;
    let updated = 0;
    const needsReview = [];
    const unmatched = [];
    const processedSet = new Set(user.integrations?.gmailProcessedMessageIds || []);

    for (const msg of messages) {
      if (processedSet.has(msg.id)) continue;

      const detailRes = await fetch(`${GMAIL_MESSAGES_URL}/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const detail = await detailRes.json();
      const headers = detail.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "";
      const from = headers.find((h) => h.name === "From")?.value || "";
      const snippet = detail.snippet || "";
      const tokenMatch = subject.match(TRACKING_TOKEN_REGEX);
      const token = tokenMatch?.[1] || "";

      let best = null;
      let confidence = 0;

      if (token) {
        const byToken = apps.find((app) => app.outreachTrackingToken === token);
        if (byToken) {
          best = byToken;
          confidence = 95;
        }
      }

      if (!best) {
        apps.forEach((app) => {
          let score = 0;
          if (app.email && from.toLowerCase().includes(String(app.email).toLowerCase())) score += 70;
          if (subject.toLowerCase().includes(String(app.company || "").toLowerCase())) score += 25;
          if (subject.toLowerCase().includes(String(app.role || "").toLowerCase())) score += 15;
          if (score > confidence) {
            confidence = score;
            best = app;
          }
        });
      }

      if (!best || confidence < 50) {
        processedSet.add(msg.id);
        unmatched.push({
          subject: subject || "(No subject)",
          from: from || "(Unknown sender)",
        });
        continue;
      }

      matched += 1;
      if (confidence < 80) {
        await GmailReview.findOneAndUpdate(
          { user: req.user.id, messageId: msg.id },
          {
            user: req.user.id,
            application: best._id,
            messageId: msg.id,
            from: from || "",
            subject: subject || "",
            snippet: snippet || "",
            confidence,
            status: "pending",
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        needsReview.push({
          appId: best._id,
          company: best.company,
          role: best.role,
          confidence,
          subject: subject || "(No subject)",
          from: from || "(Unknown sender)",
        });
        processedSet.add(msg.id);
        continue;
      }

      if (best.status === "applied" && confidence >= 80) {
        best.status = "interview";
        updated += 1;
      }
      best.lastActionDate = new Date();
      best.history = best.history || [];
      best.history.push({
        action: "email-reply-detected",
        details: `Source=gmail; confidence=${confidence}; messageId=${msg.id}; subject=${subject || "No subject"}`,
        date: new Date(),
      });
      await best.save();
      processedSet.add(msg.id);
    }

    user.integrations = user.integrations || {};
    user.integrations.gmailProcessedMessageIds = Array.from(processedSet).slice(-500);
    user.integrations.gmailLastSync = {
      at: new Date(),
      scanned: messages.length,
      matched,
      updated,
      needsReview: needsReview.length,
      unmatched: unmatched.length,
      status: "success",
      error: "",
    };
    await user.save();

    res.json({
      scanned: messages.length,
      matched,
      updated,
      needsReviewCount: needsReview.length,
      needsReview: needsReview.slice(0, 10),
      unmatchedCount: unmatched.length,
    });
  } catch (err) {
    try {
      const user = await User.findById(req.user.id);
      if (user) {
        user.integrations = user.integrations || {};
        user.integrations.gmailLastSync = {
          at: new Date(),
          scanned: 0,
          matched: 0,
          updated: 0,
          needsReview: 0,
          unmatched: 0,
          status: "error",
          error: err.message || "Unknown sync error",
        };
        await user.save();
      }
    } catch {
      // Ignore logging failures so the primary error response is still returned.
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getGmailReviews = async (req, res) => {
  try {
    const reviews = await GmailReview.find({
      user: req.user.id,
      status: "pending",
    })
      .populate("application", "company role status lastActionDate nextFollowUpDate")
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ count: reviews.length, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.confirmGmailReview = async (req, res) => {
  try {
    const review = await GmailReview.findOne({
      _id: req.params.id,
      user: req.user.id,
      status: "pending",
    });
    if (!review) return res.status(404).json({ error: "Review item not found or already processed." });

    const app = await Application.findOne({ _id: review.application, user: req.user.id });
    if (!app) return res.status(404).json({ error: "Application not found." });

    const requestedStatus = req.body?.status;
    const shouldKeepStatus = requestedStatus === "just-response" || requestedStatus === "no-change";
    const newStatus = shouldKeepStatus ? app.status : (requestedStatus || "interview");
    if (!shouldKeepStatus && ["applied", "interview", "offer", "rejected"].includes(newStatus)) {
      app.status = newStatus;
    }
    app.lastActionDate = new Date();
    app.history = app.history || [];
    app.history.push({
      action: "email-reply-confirmed",
      details: `Manual confirm from review queue (messageId=${review.messageId}, confidence=${review.confidence}, status=${shouldKeepStatus ? "no-change" : newStatus})`,
      date: new Date(),
    });
    await app.save();

    review.status = "confirmed";
    await review.save();

    res.json({ success: true, reviewId: review._id, applicationId: app._id, status: app.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.ignoreGmailReview = async (req, res) => {
  try {
    const review = await GmailReview.findOne({
      _id: req.params.id,
      user: req.user.id,
      status: "pending",
    });
    if (!review) return res.status(404).json({ error: "Review item not found or already processed." });
    review.status = "ignored";
    await review.save();
    res.json({ success: true, reviewId: review._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generateShareToken = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (!user.shareToken) user.shareToken = crypto.randomBytes(18).toString("hex");
    await user.save();
    res.json({ shareToken: user.shareToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPublicPipeline = async (req, res) => {
  try {
    const user = await User.findOne({ shareToken: req.params.token }).select("name");
    if (!user) return res.status(404).json({ error: "Share link not found." });
    const apps = await Application.find({ user: user._id }).sort({ createdAt: -1 });

    const pipeline = {
      applied: apps.filter((a) => a.status === "applied").length,
      interview: apps.filter((a) => a.status === "interview").length,
      offer: apps.filter((a) => a.status === "offer").length,
      rejected: apps.filter((a) => a.status === "rejected").length,
    };

    res.json({
      owner: user.name || "Anonymous User",
      pipeline,
      applications: apps.map((app) => ({
        id: app._id,
        company: app.company,
        role: app.role,
        status: app.status,
        appliedDate: app.appliedDate,
        interviewDate: app.interviewDate,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getExternalAutomationHints = async (req, res) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, user: req.user.id });
    if (!app) return res.status(404).json({ error: "Application not found." });

    const daysIdle = daysBetween(app.lastActionDate || app.updatedAt || app.createdAt);
    const resumeHint = app.resumeName
      ? `Resume "${app.resumeName}" is attached to this role.`
      : "No resume linked yet. Attach a tailored resume.";
    const outreachHint =
      daysIdle >= 7
        ? `No activity for ${daysIdle} days. Send a concise follow-up.`
        : "Current outreach cadence looks healthy.";

    res.json({
      resumeOptimization: resumeHint,
      outreachOptimization: outreachHint,
      outreachTemplate:
        (app.followUpCount || 0) === 0
          ? "Template: first follow-up, polite and concise."
          : (app.followUpCount || 0) === 1
            ? "Template: second follow-up, reinforce interest and value."
            : "Template: final follow-up, respectful close.",
      gmailSync: "If Gmail is connected, sync replies to auto-update statuses.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
