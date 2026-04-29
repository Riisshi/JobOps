import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getReminders, createReminder, updateReminder, deleteReminder } from "../api";
import { getApiErrorMessage } from "../utils/feedback";
import "./Dashboard.css";

const TYPE_LABELS = {
  "follow-up": "Follow-up",
  interview: "Interview",
  prep: "Prep",
  custom: "Custom",
};

function Reminders({ embedded = false }) {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    note: "",
    type: "custom",
    dueDate: "",
  });

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReminders();
      setReminders(res.data);
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Could not load reminders.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const resetForm = () => {
    setForm({ title: "", note: "", type: "custom", dueDate: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.dueDate) {
      setMessage({ type: "error", text: "Title and due date are required." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        const res = await updateReminder(editingId, form);
        setReminders((prev) => prev.map((r) => (r._id === editingId ? res.data : r)));
        setMessage({ type: "success", text: "Reminder updated." });
      } else {
        const res = await createReminder(form);
        setReminders((prev) => [res.data, ...prev]);
        setMessage({ type: "success", text: "Reminder created." });
      }
      resetForm();
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Failed to save reminder.") });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleComplete = async (reminder) => {
    try {
      const res = await updateReminder(reminder._id, { completed: !reminder.completed });
      setReminders((prev) => prev.map((r) => (r._id === reminder._id ? res.data : r)));
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Failed to update reminder.") });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this reminder?")) return;
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r._id !== id));
      setMessage({ type: "success", text: "Reminder deleted." });
    } catch (err) {
      setMessage({ type: "error", text: getApiErrorMessage(err, "Failed to delete reminder.") });
    }
  };

  const handleEdit = (reminder) => {
    setForm({
      title: reminder.title,
      note: reminder.note || "",
      type: reminder.type || "custom",
      dueDate: reminder.dueDate ? reminder.dueDate.slice(0, 10) : "",
    });
    setEditingId(reminder._id);
    setShowForm(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "No date";
    return new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isOverdue = (dateString) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date(new Date().toDateString());
  };

  const pendingReminders = reminders.filter((r) => !r.completed);
  const completedReminders = reminders.filter((r) => r.completed);

  if (loading) {
    return embedded ? (
      <section className="list-panel"><p className="empty-column">Loading reminders...</p></section>
    ) : (
      <div className="form-page">Loading reminders...</div>
    );
  }

  const header = (
    <section className={embedded ? "section-heading" : "detail-header"}>
      {!embedded && <button className="secondary-button" onClick={() => navigate("/")}>Back</button>}
      <div>
        <h2>{embedded ? "Reminders" : "Reminders"}</h2>
        <p>Manage your follow-ups and tasks</p>
      </div>
      <button className="primary-button" onClick={() => setShowForm(true)}>
        + Add Reminder
      </button>
    </section>
  );

  const content = (
    <>
      {message && (
        <div className={`toast ${message.type}`}>
          {message.text}
          <button className="toast-close" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {showForm && (
        <section className="detail-card">
          <h2>{editingId ? "Edit Reminder" : "New Reminder"}</h2>
          <form className="settings-form" onSubmit={handleSubmit}>
            <label>
              Title *
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Follow up with recruiter"
              />
            </label>
            <label>
              Type
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="custom">Custom</option>
                <option value="follow-up">Follow-up</option>
                <option value="interview">Interview</option>
                <option value="prep">Prep</option>
              </select>
            </label>
            <label>
              Due Date *
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              />
            </label>
            <label>
              Note
              <textarea
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Additional details..."
                rows={3}
              />
            </label>
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="detail-grid">
        <article className="detail-card">
          <h2>Pending ({pendingReminders.length})</h2>
          <div className="reminder-list">
            {pendingReminders.length ? (
              pendingReminders.map((reminder) => (
                <div
                  key={reminder._id}
                  className={`reminder-item ${isOverdue(reminder.dueDate) ? "overdue" : ""}`}
                >
                  <div className="reminder-check">
                    <input
                      type="checkbox"
                      checked={!!reminder.completed}
                      onChange={() => handleToggleComplete(reminder)}
                    />
                  </div>
                  <div className="reminder-content">
                    <strong>{reminder.title}</strong>
                    <span className="reminder-type">{TYPE_LABELS[reminder.type] || "Custom"}</span>
                    <span className={`reminder-date ${isOverdue(reminder.dueDate) ? "overdue" : ""}`}>
                      {formatDate(reminder.dueDate)}
                    </span>
                    {reminder.note && <p className="reminder-note">{reminder.note}</p>}
                    {reminder.application && (
                      <p className="reminder-app">
                        Re: {reminder.application.company} - {reminder.application.role}
                      </p>
                    )}
                  </div>
                  <div className="reminder-actions">
                    <button className="icon-button" onClick={() => handleEdit(reminder)} aria-label="Edit">
                      ✎
                    </button>
                    <button className="icon-button" onClick={() => handleDelete(reminder._id)} aria-label="Delete">
                      🗑
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-column">No pending reminders.</p>
            )}
          </div>
        </article>

        <article className="detail-card">
          <h2>Completed ({completedReminders.length})</h2>
          <div className="reminder-list">
            {completedReminders.length ? (
              completedReminders.map((reminder) => (
                <div key={reminder._id} className="reminder-item completed">
                  <div className="reminder-check">
                    <input
                      type="checkbox"
                      checked={!!reminder.completed}
                      onChange={() => handleToggleComplete(reminder)}
                    />
                  </div>
                  <div className="reminder-content">
                    <strong>{reminder.title}</strong>
                    <span className="reminder-type">{TYPE_LABELS[reminder.type] || "Custom"}</span>
                    <span className="reminder-date">
                      {formatDate(reminder.completedAt)}
                    </span>
                  </div>
                  <div className="reminder-actions">
                    <button className="icon-button" onClick={() => handleDelete(reminder._id)} aria-label="Delete">
                      🗑
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-column">No completed reminders.</p>
            )}
          </div>
        </article>
      </section>
    </>
  );

  if (embedded) {
    return (
      <section className="list-panel">
        {header}
        {content}
      </section>
    );
  }

  return (
    <main className="detail-page">
      {header}
      {content}
    </main>
  );
}

export default Reminders;
