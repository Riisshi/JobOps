const path = require("path");
const mongoose = require(path.join(__dirname, "..", "server", "node_modules", "mongoose"));
require(path.join(__dirname, "..", "server", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "server", ".env"),
});

const BASE_URL = "http://localhost:5000/api";

const request = async (pathName, options = {}) => {
  const res = await fetch(`${BASE_URL}${pathName}`, options);
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const report = [];
const record = (name, passed, details = "") => report.push({ name, passed, details });

const run = async () => {
  const stamp = Date.now();
  const email = `validate_${stamp}@example.com`;
  const password = "Passw0rd!123";

  // 1) Register/Login
  const reg = await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Validation User", email, password }),
  });
  assert(reg.ok, "Register failed");

  const login = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(login.ok && login.body?.token, "Login failed");
  const token = login.body.token;
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  record("Core auth flow (register/login)", true, "User can register and login.");

  // 2) Invalid token
  const invalid = await request("/applications", {
    headers: { Authorization: "Bearer invalid_token_here" },
  });
  assert(invalid.status === 401, `Expected 401 for invalid token, got ${invalid.status}`);
  record("Invalid token rejection", true, "401 returned for invalid token.");

  // 3) Create application
  const create = await request("/applications", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      company: "Validation Corp",
      role: "QA Engineer",
      email: "recruiter@validation.example",
      notes: "validation baseline",
    }),
  });
  assert(create.ok && create.body?._id, "Create application failed");
  const appId = create.body._id;
  record("Create application", true, `Application ${appId} created.`);

  // DB direct setup for review queue scenarios
  await mongoose.connect(process.env.MONGO_URI);
  const GmailReview = require(path.join(__dirname, "..", "server", "models", "GmailReview"));
  const Application = require(path.join(__dirname, "..", "server", "models", "Application"));
  const User = require(path.join(__dirname, "..", "server", "models", "User"));
  const userDoc = await User.findOne({ email });
  assert(userDoc?._id, "User not found in DB");

  // 4) Confirm twice idempotency
  const review1 = await GmailReview.create({
    user: userDoc._id,
    application: appId,
    messageId: `msg-confirm-twice-${stamp}`,
    from: "recruiter@validation.example",
    subject: "Re: Follow-up",
    confidence: 71,
    status: "pending",
  });

  const confirm1 = await request(`/automation/gmail/reviews/${review1._id}/confirm`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ status: "interview" }),
  });
  assert(confirm1.ok, "First confirm failed");

  const confirm2 = await request(`/automation/gmail/reviews/${review1._id}/confirm`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ status: "offer" }),
  });
  assert(confirm2.status === 404, `Expected 404 on second confirm, got ${confirm2.status}`);
  record("Review confirm twice idempotency", true, "Second confirm blocked as already processed.");

  // 5) Ignore then confirm
  const review2 = await GmailReview.create({
    user: userDoc._id,
    application: appId,
    messageId: `msg-ignore-confirm-${stamp}`,
    from: "recruiter2@validation.example",
    subject: "Re: Follow-up 2",
    confidence: 66,
    status: "pending",
  });
  const ignore = await request(`/automation/gmail/reviews/${review2._id}/ignore`, {
    method: "POST",
    headers: authHeaders,
  });
  assert(ignore.ok, "Ignore review failed");
  const confirmAfterIgnore = await request(`/automation/gmail/reviews/${review2._id}/confirm`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ status: "interview" }),
  });
  assert(confirmAfterIgnore.status === 404, `Expected 404 confirm-after-ignore, got ${confirmAfterIgnore.status}`);
  record("Ignore then confirm guard", true, "Confirm blocked after ignore.");

  // 6) Delete application should cleanup pending review queue
  const app2 = await request("/applications", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      company: "Cleanup Corp",
      role: "Backend Engineer",
      email: "recruiter@cleanup.example",
      notes: "cleanup scenario",
    }),
  });
  assert(app2.ok && app2.body?._id, "Second application create failed");
  const app2Id = app2.body._id;
  await GmailReview.create({
    user: userDoc._id,
    application: app2Id,
    messageId: `msg-cleanup-${stamp}`,
    from: "recruiter@cleanup.example",
    subject: "Cleanup review",
    confidence: 62,
    status: "pending",
  });
  const del = await request(`/applications/${app2Id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(del.ok, "Delete application failed");
  const reviewsAfterDelete = await request("/automation/gmail/reviews", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const stillExists = (reviewsAfterDelete.body?.reviews || []).some((r) => r.messageId === `msg-cleanup-${stamp}`);
  assert(!stillExists, "Pending review was not cleaned up after app deletion");
  record("Delete cleanup for pending reviews", true, "Pending review removed when application deleted.");

  // 7) Gmail disconnected path
  await User.updateOne(
    { _id: userDoc._id },
    {
      $set: {
        "integrations.gmailConnected": false,
        "integrations.gmailOAuth.accessToken": "",
        "integrations.gmailOAuth.refreshToken": "",
      },
    }
  );
  const syncNoGmail = await request("/automation/gmail/sync-replies", {
    method: "POST",
    headers: authHeaders,
  });
  assert(syncNoGmail.status === 400, `Expected 400 when Gmail disconnected, got ${syncNoGmail.status}`);
  record("Gmail disconnected sync failure path", true, "Graceful 400 with actionable message.");

  // 8) Data integrity: no duplicate timeline for confirm twice
  const appAfter = await Application.findById(appId).lean();
  const confirmEvents = (appAfter?.history || []).filter((h) => h.action === "email-reply-confirmed");
  assert(confirmEvents.length === 1, `Expected exactly 1 confirm timeline event, found ${confirmEvents.length}`);
  record("Timeline idempotency for confirm", true, "No duplicate confirm event logged.");

  await mongoose.disconnect();
};

run()
  .then(() => {
    const passed = report.filter((r) => r.passed).length;
    const failed = report.length - passed;
    console.log(JSON.stringify({ passed, failed, report }, null, 2));
  })
  .catch(async (err) => {
    try {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    } catch {
      // ignore
    }
    console.error("System validation failed:", err.message);
    process.exit(1);
  });
