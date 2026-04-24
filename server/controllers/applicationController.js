const Application = require("../models/Application");
const sendEmail = require("../utils/emailService");

exports.createApplication = async (req, res) => {
  try {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 3);

    const app = new Application({
      ...req.body,
      nextFollowUpDate: nextDate
    });

    await app.save();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getApplications = async (req, res) => {
  try {
    const apps = await Application.find().sort({ appliedDate: -1 });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const app = await Application.findByIdAndUpdate(
      req.params.id,
      {
        status,
        lastActionDate: Date.now(),
      },
      { new: true }
    );

    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generateFollowUp = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);

    if (!app) {
      return res.status(404).json({ error: "Application not found" });
    }

    // 1. Create the template
    const message = `Hi,\n\nI wanted to follow up regarding my application for the ${app.role} position at ${app.company}. \n\nI’m very interested and would love to know if there are any updates.\n\nBest regards,\n[Your Name]`;

    // 2. LOGIC JUMP: Push the follow-up date 3 days into the future
    const newFollowUpDate = new Date();
    newFollowUpDate.setDate(newFollowUpDate.getDate() + 3);

    app.nextFollowUpDate = newFollowUpDate;
    await app.save();

    // Send back the message and the updated app
    res.json({ message, app });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendFollowUp = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);

    if (!app || !app.email) {
      return res.status(400).json({ error: "Application or Recruiter Email missing." });
    }

    const message = `Hi,\n\nI'm following up on my application for the ${app.role} position at ${app.company}. I'm still very interested and look forward to hearing from you!\n\nBest,\n[Your Name]`;

    // 1. Send the actual email
    await sendEmail(app.email, `Follow-up: ${app.role} role at ${app.company}`, message);

    // 2. Logic: Push the follow-up date 3 days into the future
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 3);

    app.lastActionDate = new Date();
    app.nextFollowUpDate = nextDate;

    await app.save();

    res.json({ success: true, message: "Email sent and tracker updated!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const apps = await Application.find();

    const total = apps.length;

    // A "response" is anything that isn't just 'applied' or 'rejected' without a word
    const responses = apps.filter(
      (app) => app.status === "interview" || app.status === "offer"
    ).length;

    const responseRate = total === 0 ? 0 : ((responses / total) * 100).toFixed(1);

    // Reuse your logic for follow-ups
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const followUpsPending = apps.filter(app => {
      if (!app.nextFollowUpDate) return false;
      const followDate = new Date(app.nextFollowUpDate);
      followDate.setHours(0, 0, 0, 0);
      return followDate <= today && app.status === "applied";
    }).length;

    res.json({
      total,
      responseRate,
      followUps: followUpsPending,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStreak = async (req, res) => {
  try {
    // Get all apps sorted by date (newest first)
    const apps = await Application.find().sort({ appliedDate: -1 });

    if (apps.length === 0) {
      return res.json({ streak: 0 });
    }

    // Create a Set of unique "YYYY-MM-DD" strings for fast lookup
    const applicationDates = new Set(
      apps.map(app => new Date(app.appliedDate).toDateString())
    );

    let streak = 0;
    let checkDate = new Date(); // Start checking from today
    checkDate.setHours(0, 0, 0, 0);

    // If they haven't applied today yet, check if they applied yesterday to keep the streak alive
    if (!applicationDates.has(checkDate.toDateString())) {
       checkDate.setDate(checkDate.getDate() - 1);
    }

    // Loop backwards and count consecutive days
    while (applicationDates.has(checkDate.toDateString())) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    res.json({ streak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};