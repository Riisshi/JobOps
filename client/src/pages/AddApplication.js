import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { getApiErrorMessage } from "../utils/feedback";
import "./Dashboard.css";

function AddApplication() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [resumeLink, setResumeLink] = useState("");
  const [coverLetterLink, setCoverLetterLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.toggle("jobops-dark", localStorage.getItem("jobops-theme") === "dark");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      await API.post("/applications", {
        company,
        role,
        email,
        status: "applied",
        notes,
        jobLink,
        resumeName,
        resumeLink,
        coverLetterLink,
      });
      navigate("/");
    } catch (err) {
      setError(getApiErrorMessage(err, "Error adding application. Make sure you are logged in."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="form-page">
      <section className="form-card">
        <button className="brand form-brand" onClick={() => navigate("/")}>
          <span className="jo-icon jo-icon-briefcase" aria-hidden="true" />
          <span>Job<strong>Ops</strong></span>
        </button>
        <div className="form-heading">
          <h1>Add Application</h1>
          <p>Add the role details and JobOps will place it into your application pipeline.</p>
        </div>

        {error && <div className="toast error">{error}</div>}

        <form onSubmit={handleSubmit} className="application-form">
          <label>
            Company Name
            <input value={company} onChange={(e) => setCompany(e.target.value)} required />
          </label>
          <label>
            Job Role
            <input value={role} onChange={(e) => setRole(e.target.value)} required />
          </label>
          <label>
            Recruiter Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Job Description Link
            <input value={jobLink} onChange={(e) => setJobLink(e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Resume Used
            <input value={resumeName} onChange={(e) => setResumeName(e.target.value)} placeholder="Frontend resume v2" />
          </label>
          <label>
            Resume Link
            <input value={resumeLink} onChange={(e) => setResumeLink(e.target.value)} placeholder="Drive/Notion/GitHub link" />
          </label>
          <label>
            Cover Letter Link
            <input value={coverLetterLink} onChange={(e) => setCoverLetterLink(e.target.value)} placeholder="Optional" />
          </label>
          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Recruiter, context, next steps"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => navigate("/")}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Adding..." : "Add Application"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default AddApplication;
