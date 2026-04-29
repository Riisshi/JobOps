const Application = require("../models/Application");
const User = require("../models/User");
const GmailReview = require("../models/GmailReview");
const sendEmail = require("../utils/emailService");

// Cooldown schedule after each sent follow-up (in days).
const FOLLOW_UP_SCHEDULE = [3, 5, 7];

const DAY_MS = 1000 * 60 * 60 * 24;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysSince = (fromDate, now = new Date()) => {
  if (!fromDate) return 0;
  return Math.floor((now - new Date(fromDate)) / DAY_MS);
};

const addHistoryEntry = (app, action, details) => {
  if (!app.history) app.history = [];
  app.history.push({ action, details, date: new Date() });
};

const calculatePriority = (app, now = new Date()) => {
  if (app.status !== "applied") return "low";

  const today = startOfDay(now);
  const appliedDaysAgo = daysSince(app.appliedDate, now);
  const hasDueFollowUp =
    app.nextFollowUpDate && startOfDay(app.nextFollowUpDate) <= today;
  const noResponseTooLong = appliedDaysAgo >= 14;
  const staleAfterMaxFollowUps =
    app.followUpCount >= FOLLOW_UP_SCHEDULE.length && appliedDaysAgo >= 14;

  if (hasDueFollowUp || noResponseTooLong || staleAfterMaxFollowUps) {
    return "high";
  }

  if (appliedDaysAgo >= 7) {
    return "medium";
  }

  return "low";
};

const calculatePriorityScore = (app, now = new Date()) => {
  let score = 0;
  const reasons = [];
  const appliedDaysAgo = daysSince(app.appliedDate || app.createdAt, now);
  const idleDays = daysSince(app.lastActionDate || app.updatedAt || app.createdAt, now);

  if (app.status === "applied") {
    if ((app.followUpCount || 0) === 0 && !app.lastFollowUpSent) {
      score += 35;
      reasons.push("First follow-up is ready");
    }

    if (app.nextFollowUpDate && startOfDay(app.nextFollowUpDate) <= startOfDay(now)) {
      score += 45;
      reasons.push("Follow-up is due");
    }

    if (appliedDaysAgo >= 10) {
      score += 25;
      reasons.push(`${appliedDaysAgo} days since applying`);
    }

    if (idleDays >= 7) {
      score += 15;
      reasons.push(`${idleDays} days without activity`);
    }

    score += Math.min((app.followUpCount || 0) * 6, 18);
  }

  if (app.status === "interview") {
    if (!app.interviewDate) {
      score += 60;
      reasons.push("Interview date is missing");
    } else {
      const daysUntilInterview = Math.ceil((new Date(app.interviewDate) - startOfDay(now)) / DAY_MS);
      if (daysUntilInterview >= 0 && daysUntilInterview <= 3) {
        score += 70 - daysUntilInterview * 15;
        reasons.push(daysUntilInterview === 0 ? "Interview is today" : `Interview in ${daysUntilInterview} day${daysUntilInterview === 1 ? "" : "s"}`);
      }
    }
  }

  if (app.status === "offer") {
    score += 20;
    reasons.push("Offer needs decision tracking");
  }

  return {
    score: Math.min(score, 100),
    level: score >= 70 ? "high" : score >= 35 ? "medium" : "low",
    reasons,
  };
};

const getFollowUpSuggestion = (app, now = new Date()) => {
  if (app.status !== "applied") {
    return {
      subject: "",
      body: "Follow-up suggestions are only generated for active applications.",
    };
  }

  const appliedDaysAgo = daysSince(app.appliedDate || app.createdAt, now);
  const followUpCount = app.followUpCount || 0;
  const tone = followUpCount >= 2 ? "final concise follow-up" : followUpCount === 1 ? "warm second follow-up" : "short first follow-up";

  return {
    subject: `Following up on ${app.role} at ${app.company}`,
    body: `Use a ${tone}. Mention that you applied ${appliedDaysAgo} day${appliedDaysAgo === 1 ? "" : "s"} ago, restate interest in the ${app.role} role, and ask whether there are updates on the hiring process.`,
  };
};

const enrichApplication = (app, now = new Date()) => {
  const priority = calculatePriority(app, now);
  const priorityScore = calculatePriorityScore(app, now);
  return {
    ...app.toObject(),
    priority,
    priorityScore,
    followUpSuggestion: getFollowUpSuggestion(app, now),
  };
};

const getSenderName = async (userId) => {
  const user = await User.findById(userId).select("name email");
  return user?.name?.trim() || user?.email?.split("@")[0]?.trim() || null;
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
};

const ensureTrackingToken = (app) => {
  if (app.outreachTrackingToken) return app.outreachTrackingToken;
  const shortId = String(app._id || "").slice(-6);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  app.outreachTrackingToken = `JO-${shortId}-${rand}`;
  return app.outreachTrackingToken;
};

// 1. Create Application
exports.createApplication = async (req, res) => {
  try {
    const {
      company,
      role,
      email,
      notes,
      jobLink,
      resumeName,
      resumeLink,
      coverLetterLink,
    } = req.body;
    const now = new Date();

    const newApp = new Application({
      company,
      role,
      email,
      notes: notes || "",
      jobLink: jobLink || "",
      resumeName: resumeName || "",
      resumeLink: resumeLink || "",
      coverLetterLink: coverLetterLink || "",
      status: "applied",
      user: req.user.id,
      nextFollowUpDate: now, // First follow-up is available immediately.
      followUpCount: 0,
      lastActionDate: now,
      history: [
        {
          action: "applied",
          details: `Applied to ${company} for ${role}`,
          date: now,
        },
      ],
    });

    newApp.priority = calculatePriority(newApp, now);

    await newApp.save();
    res.json(newApp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getApplicationById = async (req, res) => {
  try {
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!app) {
      return res
        .status(404)
        .json({ error: "Application not found or unauthorized" });
    }

    res.json(enrichApplication(app));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 2. Get Applications
exports.getApplications = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id }).sort({
      createdAt: -1,
    });

    const enrichedApps = apps.map((app) => enrichApplication(app));

    res.json(enrichedApps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 3. Update Status
exports.updateStatus = async (req, res) => {
  try {
    const { status, interviewDate } = req.body;
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!app) {
      return res
        .status(404)
        .json({ error: "Application not found or unauthorized" });
    }

    const previousStatus = app.status;
    app.status = status;
    if (status === "interview" && interviewDate !== undefined) {
      app.interviewDate = interviewDate ? new Date(interviewDate) : undefined;
    }
    if (previousStatus === "interview" && status !== "interview") {
      app.interviewDate = undefined;
    }
    app.lastActionDate = new Date();
    addHistoryEntry(
      app,
      "status-change",
      `Status changed from ${previousStatus} to ${status}`
    );
    app.priority = calculatePriority(app);

    await app.save();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateInterviewDate = async (req, res) => {
  try {
    const { interviewDate, interviewStage } = req.body;
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!app) {
      return res
        .status(404)
        .json({ error: "Application not found or unauthorized" });
    }

    if (app.status !== "interview") {
      return res
        .status(400)
        .json({ error: "Interview date can only be set for interview applications." });
    }

    app.interviewDate = interviewDate ? new Date(interviewDate) : undefined;
    if (interviewStage !== undefined) app.interviewStage = interviewStage || "";
    app.lastActionDate = new Date();
    addHistoryEntry(
      app,
      "interview-date",
      app.interviewDate
        ? `Interview scheduled for ${app.interviewDate.toISOString()}`
        : "Interview date cleared"
    );

    await app.save();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateApplicationDetails = async (req, res) => {
  try {
    const allowed = [
      "email",
      "jobLink",
      "resumeName",
      "resumeLink",
      "coverLetterLink",
      "interviewStage",
    ];
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!app) {
      return res
        .status(404)
        .json({ error: "Application not found or unauthorized" });
    }

    allowed.forEach((field) => {
      if (req.body[field] !== undefined) app[field] = req.body[field] || "";
    });

    app.lastActionDate = new Date();
    addHistoryEntry(app, "details-update", "Updated application details");
    app.priority = calculatePriority(app);

    await app.save();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 4. Update Notes
exports.updateNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!app) {
      return res
        .status(404)
        .json({ error: "Application not found or unauthorized" });
    }

    app.notes = notes || "";
    app.lastActionDate = new Date();
    addHistoryEntry(app, "note-update", "Updated application notes");
    app.priority = calculatePriority(app);

    await app.save();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5. Send Follow-up
exports.sendFollowUp = async (req, res) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, user: req.user.id });

    if (!app || !app.email) {
      return res
        .status(400)
        .json({ error: "Application or Recruiter Email missing." });
    }

    if (app.followUpCount >= FOLLOW_UP_SCHEDULE.length) {
      return res
        .status(400)
        .json({ error: "Maximum follow-ups reached. No more follow-ups scheduled." });
    }

    const now = new Date();
    const isFirstFollowUp = app.followUpCount === 0 && !app.lastFollowUpSent;

    if (!isFirstFollowUp) {
      if (!app.nextFollowUpDate) {
        return res.status(400).json({ error: "No more follow-ups allowed." });
      }

      const nextFollowUpDate = new Date(app.nextFollowUpDate);
      if (now < nextFollowUpDate) {
        return res.status(400).json({
          error: "Too early to send follow-up.",
          nextFollowUpDate,
        });
      }
    }

    if (app.lastFollowUpSent) {
      const hoursSinceLast =
        (now - new Date(app.lastFollowUpSent)) / (1000 * 60 * 60);
      if (hoursSinceLast < 24) {
        return res
          .status(429)
          .json({ error: "You can only send one follow-up every 24 hours." });
      }
    }

    const senderName = await getSenderName(req.user.id);
    if (!senderName) {
      return res
        .status(400)
        .json({ error: "Account name is missing. Please update your profile name." });
    }

    const followUpNum = app.followUpCount + 1;
    const trackingToken = ensureTrackingToken(app);
    let message;

    if (followUpNum === 1) {
      message = `Hi,\n\nI'm following up on my application for the ${app.role} position at ${app.company}. I'm still very interested and look forward to hearing from you!\n\nBest,\n${senderName}`;
    } else if (followUpNum === 2) {
      message = `Hi,\n\nI wanted to follow up again on my application for the ${app.role} position at ${app.company}. I'm still very enthusiastic about the opportunity and would love to discuss how I can contribute to your team.\n\nBest regards,\n${senderName}`;
    } else {
      message = `Hi,\n\nI'm reaching out one final time regarding my application for the ${app.role} position at ${app.company}. I understand you're busy, but I remain very interested in the opportunity. Please let me know if there's any additional information I can provide.\n\nThank you for your time,\n${senderName}`;
    }

    await sendEmail(
      app.email,
      `[${trackingToken}] Follow-up #${followUpNum}: ${app.role} role at ${app.company}`,
      message
    );

    app.followUpCount += 1;
    app.lastFollowUpSent = now;
    app.lastActionDate = now;
    addHistoryEntry(app, "follow-up", `Sent follow-up #${followUpNum} (${trackingToken})`);

    if (app.followUpCount >= FOLLOW_UP_SCHEDULE.length) {
      app.nextFollowUpDate = null;
    } else {
      const nextDays = FOLLOW_UP_SCHEDULE[app.followUpCount - 1];
      const nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + nextDays);
      app.nextFollowUpDate = nextDate;
    }

    app.priority = calculatePriority(app, now);

    await app.save();
    res.json({
      success: true,
      message: `Email sent! (${app.followUpCount}/${FOLLOW_UP_SCHEDULE.length} follow-ups used)`,
      followUpCount: app.followUpCount,
      nextFollowUpDate: app.nextFollowUpDate,
      senderNameUsed: senderName,
      app,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 6. Get Stats
exports.getStats = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id });
    const total = apps.length;

    const responses = apps.filter(
      (app) => app.status === "interview" || app.status === "offer"
    ).length;
    const responseRate =
      total === 0 ? 0 : Number(((responses / total) * 100).toFixed(1));

    const offers = apps.filter((app) => app.status === "offer").length;
    const conversionRate =
      total === 0 ? 0 : Number(((offers / total) * 100).toFixed(1));

    const followUpsSent = apps.reduce(
      (sum, app) => sum + (app.followUpCount || 0),
      0
    );

    const today = startOfDay(new Date());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const followUpsPending = apps.filter((app) => {
      if (!app.nextFollowUpDate) return false;
      return (
        startOfDay(app.nextFollowUpDate) <= today && app.status === "applied"
      );
    }).length;

    const interviewsPerWeek = apps.filter((app) => {
      if (app.status !== "interview" || !app.interviewDate) return false;
      return new Date(app.interviewDate) >= weekAgo;
    }).length;

    const pipeline = {
      applied: apps.filter((app) => app.status === "applied").length,
      interview: apps.filter((app) => app.status === "interview").length,
      offer: apps.filter((app) => app.status === "offer").length,
      rejected: apps.filter((app) => app.status === "rejected").length,
    };

    res.json({
      total,
      responseRate,
      followUps: followUpsPending,
      interviewsPerWeek,
      followUpsSent,
      conversionRate,
      pipeline,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getIntelligence = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id });
    const now = new Date();
    const total = apps.length;
    const weekStart = startOfDay(now);
    weekStart.setDate(weekStart.getDate() - 6);
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const countStatus = (status) => apps.filter((app) => app.status === status).length;
    const applied = total;
    const interviews = countStatus("interview") + countStatus("offer");
    const offers = countStatus("offer");
    const rejected = countStatus("rejected");

    const funnel = [
      { stage: "Applied", count: applied, rate: total ? 100 : 0 },
      { stage: "Interview", count: interviews, rate: total ? Number(((interviews / total) * 100).toFixed(1)) : 0 },
      { stage: "Offer", count: offers, rate: total ? Number(((offers / total) * 100).toFixed(1)) : 0 },
      { stage: "Rejected", count: rejected, rate: total ? Number(((rejected / total) * 100).toFixed(1)) : 0 },
    ];

    const thisWeekApps = apps.filter((app) => new Date(app.appliedDate || app.createdAt) >= weekStart);
    const previousWeekApps = apps.filter((app) => {
      const date = new Date(app.appliedDate || app.createdAt);
      return date >= previousWeekStart && date < weekStart;
    });

    const thisWeekInterviews = apps.filter((app) => {
      if (!app.interviewDate) return false;
      return new Date(app.interviewDate) >= weekStart;
    }).length;

    const thisWeekOffers = apps.filter((app) => {
      if (app.status !== "offer") return false;
      return new Date(app.lastActionDate || app.updatedAt) >= weekStart;
    }).length;

    const responseRate = total ? (interviews / total) * 100 : 0;
    const previousResponses = previousWeekApps.filter((app) => app.status === "interview" || app.status === "offer").length;
    const previousResponseRate = previousWeekApps.length ? (previousResponses / previousWeekApps.length) * 100 : 0;

    const companyInsights = Object.values(
      apps.reduce((acc, app) => {
        if (!acc[app.company]) acc[app.company] = { company: app.company, applications: 0, responses: 0, offers: 0 };
        acc[app.company].applications += 1;
        if (app.status === "interview" || app.status === "offer") acc[app.company].responses += 1;
        if (app.status === "offer") acc[app.company].offers += 1;
        return acc;
      }, {})
    )
      .map((item) => ({
        ...item,
        responseRate: item.applications ? Number(((item.responses / item.applications) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.responseRate - a.responseRate || b.applications - a.applications)
      .slice(0, 5);

    const followUpBuckets = [0, 1, 2, 3].map((count) => {
      const bucket = apps.filter((app) => (app.followUpCount || 0) === count);
      const responses = bucket.filter((app) => app.status === "interview" || app.status === "offer").length;
      return {
        followUps: count,
        applications: bucket.length,
        responses,
        responseRate: bucket.length ? Number(((responses / bucket.length) * 100).toFixed(1)) : 0,
      };
    });

    const priorityList = apps
      .map((app) => ({ id: app._id, company: app.company, role: app.role, status: app.status, ...calculatePriorityScore(app, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    res.json({
      funnel,
      weeklyReport: {
        applications: thisWeekApps.length,
        applicationDelta: thisWeekApps.length - previousWeekApps.length,
        interviews: thisWeekInterviews,
        offers: thisWeekOffers,
        responseRate: Number(responseRate.toFixed(1)),
        responseRateDelta: Number((responseRate - previousResponseRate).toFixed(1)),
      },
      companyInsights,
      followUpBuckets,
      priorityList,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportApplicationsCsv = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id }).sort({ createdAt: -1 });
    const headers = [
      "Company",
      "Role",
      "Status",
      "Priority",
      "Recruiter Email",
      "Applied Date",
      "Interview Date",
      "Interview Stage",
      "Follow-ups Sent",
      "Next Follow-up",
      "Job Link",
      "Resume Used",
      "Resume Link",
      "Cover Letter Link",
      "Notes",
    ];

    const rows = apps.map((app) => {
      const enriched = enrichApplication(app);
      return [
        app.company,
        app.role,
        app.status,
        enriched.priority,
        app.email,
        app.appliedDate?.toISOString(),
        app.interviewDate?.toISOString(),
        app.interviewStage,
        app.followUpCount || 0,
        app.nextFollowUpDate?.toISOString(),
        app.jobLink,
        app.resumeName,
        app.resumeLink,
        app.coverLetterLink,
        app.notes,
      ].map(escapeCsv).join(",");
    });

    const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=jobops-applications.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportApplicationsPdfReport = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id }).sort({ createdAt: -1 });
    const total = apps.length;
    const interviews = apps.filter((app) => app.status === "interview").length;
    const offers = apps.filter((app) => app.status === "offer").length;
    const rejected = apps.filter((app) => app.status === "rejected").length;
    const responseRate = total ? Number((((interviews + offers) / total) * 100).toFixed(1)) : 0;

    const rows = apps
      .map(
        (app) => `
          <tr>
            <td>${app.company}</td>
            <td>${app.role}</td>
            <td>${app.status}</td>
            <td>${new Date(app.appliedDate || app.createdAt).toLocaleDateString()}</td>
            <td>${app.followUpCount || 0}</td>
          </tr>`
      )
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>JobOps Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 8px; }
    p { margin: 0 0 14px; }
    .stats { display: flex; gap: 16px; margin: 12px 0 20px; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; min-width: 130px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
    th { background: #f5f5f5; }
    .hint { margin-top: 14px; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>JobOps Pipeline Report</h1>
  <p>Generated on ${new Date().toLocaleString()}</p>
  <div class="stats">
    <div class="card"><strong>${total}</strong><br/>Applications</div>
    <div class="card"><strong>${interviews}</strong><br/>Interviews</div>
    <div class="card"><strong>${offers}</strong><br/>Offers</div>
    <div class="card"><strong>${rejected}</strong><br/>Rejected</div>
    <div class="card"><strong>${responseRate}%</strong><br/>Response rate</div>
  </div>
  <table>
    <thead>
      <tr><th>Company</th><th>Role</th><th>Status</th><th>Applied</th><th>Follow-ups</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="hint">Use browser Print -> Save as PDF to export this report as a PDF file.</p>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=jobops-report.html");
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 7. Get Streak
exports.getStreak = async (req, res) => {
  try {
    const apps = await Application.find({ user: req.user.id }).sort({ appliedDate: -1 });
    if (apps.length === 0) return res.json({ streak: 0 });

    let streak = 0;
    const today = startOfDay(new Date());

    for (let i = 0; i < 30; i += 1) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);

      const hasAction = apps.some((app) => {
        if (!app.lastActionDate) return false;
        return startOfDay(app.lastActionDate).getTime() === checkDate.getTime();
      });

      if (hasAction) {
        streak += 1;
      } else if (i > 0) {
        break;
      }
    }

    res.json({ streak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 8. Delete Application
exports.deleteApplication = async (req, res) => {
  try {
    const app = await Application.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!app) {
      return res
        .status(404)
        .json({ error: "Application not found or unauthorized" });
    }

    await GmailReview.deleteMany({ user: req.user.id, application: app._id, status: "pending" });

    res.json({ success: true, message: "Application deleted", id: app._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 9. Generate Follow-up Template
exports.generateFollowUp = async (req, res) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, user: req.user.id });
    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    const senderName = await getSenderName(req.user.id);
    if (!senderName) {
      return res
        .status(400)
        .json({ error: "Account name is missing. Please update your profile name." });
    }

    const template = `Hi,

I'm following up on my application for the ${app.role} position at ${app.company}. I'm still very interested and would love to discuss any updates on the hiring process.

Best regards,
${senderName}`;

    res.json({ template });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
