import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { getApiErrorMessage } from "../utils/feedback";
import "./Dashboard.css";

function Integrations() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewBusy, setReviewBusy] = useState({});

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await API.get("/automation/integrations");
      setStatus(res.data);
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not load integration status.") });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadReviews();
  }, []);

  const loadReviews = async () => {
    setReviewLoading(true);
    try {
      const res = await API.get("/automation/gmail/reviews");
      setReviews(res.data?.reviews || []);
    } catch {
      setReviews([]);
    } finally {
      setReviewLoading(false);
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

  const syncReplies = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await API.post("/automation/gmail/sync-replies");
      const data = res.data || {};
      setMessage({
        type: "success",
        text: `Synced ${data.scanned || 0} emails, matched ${data.matched || 0}, updated ${data.updated || 0}, review needed ${data.needsReviewCount || 0}.`,
      });
      loadStatus();
      loadReviews();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Sync failed.") });
    } finally {
      setSyncing(false);
    }
  };

  const markBusy = (id, value) => setReviewBusy((prev) => ({ ...prev, [id]: value }));

  const confirmReview = async (reviewId, status = "interview") => {
    markBusy(reviewId, true);
    setMessage(null);
    try {
      await API.post(`/automation/gmail/reviews/${reviewId}/confirm`, { status });
      setMessage({ type: "success", text: "Review confirmed and application updated." });
      loadReviews();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not confirm review.") });
    } finally {
      markBusy(reviewId, false);
    }
  };

  const ignoreReview = async (reviewId) => {
    markBusy(reviewId, true);
    setMessage(null);
    try {
      await API.post(`/automation/gmail/reviews/${reviewId}/ignore`);
      setMessage({ type: "success", text: "Review ignored." });
      loadReviews();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not ignore review.") });
    } finally {
      markBusy(reviewId, false);
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleString();
  };

  if (loading) return <div className="form-page">Loading integrations...</div>;

  return (
    <main className="detail-page">
      <section className="detail-header">
        <button className="secondary-button" onClick={() => navigate("/")}>Back</button>
        <div>
          <h1>Integrations</h1>
          <p>Free mode: Gmail sync + rule-based suggestions</p>
        </div>
      </section>

      {message && <div className={`toast ${message.type}`}>{message.text}</div>}

      <section className="detail-grid">
        <article className="detail-card">
          <h2>Gmail</h2>
          <p>Status: <strong>{status?.gmail?.connected ? "Connected" : "Not connected"}</strong></p>
          <p>Account: {status?.gmail?.accountEmail || "Not linked"}</p>
          <p>Refresh Token: {status?.gmail?.hasRefreshToken ? "Available" : "Missing (reconnect Gmail)"}</p>
          <p>Last sync: {status?.gmail?.lastSync?.at ? formatDateTime(status.gmail.lastSync.at) : "Never"}</p>
          {status?.gmail?.lastSync?.status === "success" && (
            <p>
              Last result: scanned {status.gmail.lastSync.scanned || 0}, matched {status.gmail.lastSync.matched || 0}, updated {status.gmail.lastSync.updated || 0}, review {status.gmail.lastSync.needsReview || 0}.
            </p>
          )}
          {status?.gmail?.lastSync?.status === "error" && (
            <p>Last error: {status.gmail.lastSync.error || "Unknown error"}</p>
          )}
          <div className="form-actions settings-actions">
            <button className="secondary-button" onClick={connectGmail}>Connect Gmail</button>
            <button className="primary-button" onClick={syncReplies} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Replies"}
            </button>
          </div>
        </article>

        <article className="detail-card">
          <h2>Fallback Logic</h2>
          <p>{status?.fallback?.status || "Rule-based fallback is active."}</p>
          <ul>
            <li>Follow-up suggestions are template-based and free.</li>
            <li>If Gmail is disconnected, manual status updates still work.</li>
            <li>No paid AI calls are used.</li>
          </ul>
        </article>

        <article className="detail-card">
          <h2>Needs Review</h2>
          {reviewLoading ? (
            <p>Loading review queue...</p>
          ) : reviews.length ? (
            <div className="timeline-list">
              {reviews.map((item) => {
                const busy = !!reviewBusy[item._id];
                return (
                  <article className="timeline-item" key={item._id}>
                    <div>
                      <strong>{item.application?.company || "Unknown company"}</strong>
                      <span>{item.confidence}% confidence</span>
                    </div>
                    <section>
                      <h3>{item.application?.role || "Unknown role"}</h3>
                      <p><strong>Current status:</strong> {item.application?.status || "unknown"}</p>
                      <p><strong>Last interaction:</strong> {formatDateTime(item.application?.lastActionDate)}</p>
                      <p><strong>Next follow-up:</strong> {formatDateTime(item.application?.nextFollowUpDate)}</p>
                      <p>{item.subject || "(No subject)"}</p>
                      <p>{item.from || "(Unknown sender)"}</p>
                      <p>{item.snippet || "(No email snippet available)"}</p>
                      <div className="form-actions settings-actions">
                        <button className="primary-button" disabled={busy} onClick={() => confirmReview(item._id, "interview")}>
                          {busy ? "Working..." : "Interview"}
                        </button>
                        <button className="secondary-button" disabled={busy} onClick={() => confirmReview(item._id, "offer")}>
                          Offer
                        </button>
                        <button className="secondary-button" disabled={busy} onClick={() => confirmReview(item._id, "rejected")}>
                          Rejected
                        </button>
                        <button className="secondary-button" disabled={busy} onClick={() => confirmReview(item._id, "just-response")}>
                          Just Response
                        </button>
                        <button className="secondary-button" disabled={busy} onClick={() => ignoreReview(item._id)}>
                          Ignore
                        </button>
                      </div>
                    </section>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>No pending review items.</p>
          )}
        </article>
      </section>
    </main>
  );
}

export default Integrations;
