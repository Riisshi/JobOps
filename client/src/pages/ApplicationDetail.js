import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../api";
import { getApiErrorMessage } from "../utils/feedback";
import "./Dashboard.css";

const STATUS_LABEL = {
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [automationHints, setAutomationHints] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("jobops-dark", localStorage.getItem("jobops-theme") === "dark");
  }, []);

  const fetchApplication = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/applications/${id}`);
      setApp(res.data);
      setNotes(res.data.notes || "");
      setDetails({
        email: res.data.email || "",
        jobLink: res.data.jobLink || "",
        resumeName: res.data.resumeName || "",
        resumeLink: res.data.resumeLink || "",
        coverLetterLink: res.data.coverLetterLink || "",
        interviewStage: res.data.interviewStage || "",
      });
      const hintsRes = await API.get(`/automation/hints/${id}`).catch(() => null);
      if (hintsRes?.data) setAutomationHints(hintsRes.data);
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not load application.") });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  const sortedHistory = useMemo(() => {
    return (app?.history || [])
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [app]);

  const followUpHistory = useMemo(() => {
    return sortedHistory.filter((entry) => entry.action === "follow-up");
  }, [sortedHistory]);

  const formatDate = (dateString) => {
    if (!dateString) return "Not set";
    return new Date(dateString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const saveNotes = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await API.put(`/applications/${id}/notes`, { notes });
      setApp(res.data);
      setMessage({ type: "success", text: "Notes saved." });
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not save notes.") });
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await API.put(`/applications/${id}/details`, details);
      setApp(res.data);
      setMessage({ type: "success", text: "Application details saved." });
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not save details.") });
    } finally {
      setSaving(false);
    }
  };

  const connectGmail = async () => {
    try {
      const res = await API.get("/automation/gmail/auth-url");
      if (res.data?.authUrl) window.open(res.data.authUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not start Gmail OAuth.") });
    }
  };

  const syncGmail = async () => {
    try {
      const res = await API.post("/automation/gmail/sync-replies");
      const data = res.data || {};
      setMessage({
        type: "success",
        text: `Sync: ${data.scanned || 0} scanned, ${data.matched || 0} matched, ${data.updated || 0} updated, ${data.needsReviewCount || 0} review.`,
      });
      fetchApplication();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Gmail sync failed.") });
    }
  };

  if (loading) return <div className="form-page">Loading application...</div>;
  if (!app) return <div className="form-page">Application not found.</div>;

  return (
    <main className="detail-page">
      <section className="detail-header">
        <button className="secondary-button" onClick={() => navigate("/applications")}>Back</button>
        <div>
          <h1>{app.company}</h1>
          <p>{app.role}</p>
        </div>
        <span className={`priority-pill priority-${app.priority || "low"}`}>{app.priority || "low"}</span>
      </section>

      {message && <div className={`toast ${message.type}`}>{message.text}</div>}

      <section className="detail-grid">
        <article className="detail-card">
          <h2>Overview</h2>
          <dl className="detail-list">
            <div><dt>Status</dt><dd>{STATUS_LABEL[app.status] || app.status}</dd></div>
            <div><dt>Recruiter Email</dt><dd>{app.email || "Not added"}</dd></div>
            <div><dt>Applied</dt><dd>{formatDate(app.appliedDate)}</dd></div>
            <div><dt>Next Follow-up</dt><dd>{formatDate(app.nextFollowUpDate)}</dd></div>
            <div><dt>Interview</dt><dd>{formatDate(app.interviewDate)}</dd></div>
            <div><dt>Follow-ups Sent</dt><dd>{app.followUpCount || 0}</dd></div>
          </dl>
        </article>

        <article className="detail-card">
          <h2>Smart Priority</h2>
          <div className="priority-detail">
            <strong>{app.priorityScore?.score ?? 0}</strong>
            <span>{app.priorityScore?.level || "low"} priority</span>
          </div>
          <div className="reason-list">
            {(app.priorityScore?.reasons || []).length ? app.priorityScore.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            )) : <p>No urgent risk signals right now.</p>}
          </div>
        </article>

        <article className="detail-card">
          <h2>Smart Follow-up Suggestion</h2>
          <div className="suggestion-box">
            <strong>{app.followUpSuggestion?.subject || "No follow-up subject"}</strong>
            <p>{app.followUpSuggestion?.body || "No suggestion available."}</p>
          </div>
        </article>

        <article className="detail-card">
          <h2>AI + Automation Hints</h2>
          <div className="reason-list">
            <p>{automationHints?.resumeOptimization || "No resume suggestion available yet."}</p>
            <p>{automationHints?.outreachOptimization || "No outreach suggestion available yet."}</p>
            <p>{automationHints?.gmailSync || "Gmail sync hint unavailable."}</p>
            <p>{automationHints?.outreachTemplate || "No fallback template hint available."}</p>
          </div>
          <div className="form-actions settings-actions">
            <button className="secondary-button" onClick={connectGmail}>Connect Gmail</button>
            <button className="secondary-button" onClick={syncGmail}>Sync Gmail Replies</button>
          </div>
        </article>

        <article className="detail-card">
          <h2>Job Materials</h2>
          <form className="settings-form compact-form" onSubmit={saveDetails}>
            <label>
              Recruiter Email
              <input value={details.email} onChange={(e) => setDetails((prev) => ({ ...prev, email: e.target.value }))} />
            </label>
            <label>
              Job Description Link
              <input value={details.jobLink} onChange={(e) => setDetails((prev) => ({ ...prev, jobLink: e.target.value }))} />
            </label>
            <label>
              Resume Used
              <input value={details.resumeName} onChange={(e) => setDetails((prev) => ({ ...prev, resumeName: e.target.value }))} />
            </label>
            <label>
              Resume Link
              <input value={details.resumeLink} onChange={(e) => setDetails((prev) => ({ ...prev, resumeLink: e.target.value }))} />
            </label>
            <label>
              Cover Letter Link
              <input value={details.coverLetterLink} onChange={(e) => setDetails((prev) => ({ ...prev, coverLetterLink: e.target.value }))} />
            </label>
            <label>
              Interview Stage
              <select value={details.interviewStage} onChange={(e) => setDetails((prev) => ({ ...prev, interviewStage: e.target.value }))}>
                <option value="">Not set</option>
                <option value="hr">HR</option>
                <option value="technical">Technical</option>
                <option value="final">Final</option>
                <option value="other">Other</option>
              </select>
            </label>
            <div className="form-actions settings-actions">
              <button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save Details"}</button>
            </div>
          </form>
        </article>

        <article className="detail-card">
          <h2>Notes</h2>
          <textarea
            className="detail-notes"
            rows={9}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Recruiter, role context, prep notes, next steps"
          />
          <button className="primary-button" onClick={saveNotes} disabled={saving}>{saving ? "Saving..." : "Save Notes"}</button>
        </article>

        <article className="detail-card">
          <h2>Timeline</h2>
          <div className="timeline-list">
            {sortedHistory.length ? sortedHistory.map((entry, index) => (
              <article className="timeline-item" key={`${entry.action}-${entry.date}-${index}`}>
                <div>
                  <strong>{formatDate(entry.date)}</strong>
                  <span>{entry.action}</span>
                </div>
                <section>
                  <h3>{entry.details || entry.action}</h3>
                </section>
              </article>
            )) : <p className="empty-column">No timeline activity yet.</p>}
          </div>
        </article>

        <article className="detail-card">
          <h2>Follow-up History</h2>
          <div className="timeline-list">
            {followUpHistory.length ? followUpHistory.map((entry, index) => (
              <article className="timeline-item" key={`${entry.date}-${index}`}>
                <div>
                  <strong>{formatDate(entry.date)}</strong>
                  <span>Follow-up</span>
                </div>
                <section>
                  <h3>{entry.details || "Follow-up sent"}</h3>
                </section>
              </article>
            )) : <p className="empty-column">No follow-ups sent yet.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}

export default ApplicationDetail;
