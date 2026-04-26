import { useEffect, useState } from "react";
import axios from "axios";


function Dashboard() {
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({ total: 0, responseRate: 0, followUps: 0 });
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Styling object for the Stat Boxes
  const statBoxStyle = {
    background: "#fff",
    padding: "20px",
    borderRadius: "12px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
    textAlign: "center",
    border: "1px solid #eee"
  };

  useEffect(() => {
    const refreshData = async () => {
      setLoading(true);
      await Promise.all([fetchApps(), fetchStats(), fetchStreak()]);
      setLoading(false);
    };

    refreshData();
  }, []);

  const fetchStreak = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/applications/streak`);
      setStreak(res.data.streak);
    } catch (err) {
      console.error("Streak fetch failed");
    }
  };

  const fetchApps = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/applications`);
      setApps(res.data);
    } catch (err) {
      setError("Failed to load applications. Is the server running?");
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/applications/stats`);
      setStats(res.data);
    } catch (err) {
      console.error("Stats fetch failed");
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await axios.put(`${process.env.REACT_APP_API_URL}/applications/${id}/status`, { status: newStatus });
      refreshData(); 
    } catch (err) {
      alert("Error updating status");
    }
  };

  const handleFollowUp = async (id) => {
    try {
      setLoading(true);
      await axios.post(`${process.env.REACT_APP_API_URL}/applications/${id}/send-followup`);
      alert("Follow-up email sent successfully!");
      refreshData(); 
    } catch (err) {
      alert(err.response?.data?.error || "Failed to send email. Check SendGrid setup.");
    } finally {
      setLoading(false);
    }
  };

  const isDueTodayOrBefore = (dateString) => {
    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    followUpDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return followUpDate <= today;
  };

  const dueApps = apps.filter(app => 
    isDueTodayOrBefore(app.nextFollowUpDate) && app.status === 'applied'
  );

  const otherApps = apps.filter(app => 
    !(isDueTodayOrBefore(app.nextFollowUpDate) && app.status === 'applied')
  );

  const renderAppCard = (app) => (
    <div key={app._id} style={{ border: "1px solid #ccc", margin: "10px 0", padding: "15px", borderRadius: "8px", background: "#fff" }}>
      <p style={{ margin: "0 0 10px 0" }}><strong>{app.company}</strong> - {app.role}</p>
      
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <select 
          value={app.status} 
          onChange={(e) => handleStatusChange(app._id, e.target.value)}
          style={{ padding: "5px", borderRadius: "4px" }}
        >
          <option value="applied">Applied</option>
          <option value="interview">Interview</option>
          <option value="rejected">Rejected</option>
          <option value="offer">Offer</option>
        </select>

        {app.status === 'applied' && (
          <button 
            onClick={() => handleFollowUp(app._id)}
            style={{ backgroundColor: "#3498db", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}
          >
            📩 Send Follow-up
          </button>
        )}
      </div>
    </div>
  );

  if (loading && apps.length === 0) return <h2 style={{ textAlign: "center" }}>Loading your career...</h2>;
  if (error) return <h2 style={{ color: "red", textAlign: "center" }}>{error}</h2>;

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", backgroundColor: "#fafafa", minHeight: "100vh" }}>
      <h1 style={{ textAlign: "center", color: "#2c3e50", marginBottom: "30px" }}>JobOps</h1>

      {/* --- STREAK SECTION --- */}
    <div style={{ 
        textAlign: "center", 
        marginBottom: "20px", 
        padding: "20px", 
        background: streak === 0 ? "#fff5f5" : "#fff", // Subtle red background if 0
        borderRadius: "12px", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        border: streak === 0 ? "2px solid #feb2b2" : "1px solid #eee"
    }}>
    <span style={{ fontSize: "2rem" }}>
        {streak > 0 ? "🔥" : "💀"} <strong>{streak} Day Streak</strong>
    </span>
    
    {streak === 0 ? (
        <div style={{ marginTop: "10px" }}>
        <p style={{ color: "#c53030", fontWeight: "bold", margin: "0" }}>
            ⚠️ System Idle: You haven't applied to anything today.
        </p>
        <p style={{ fontSize: "0.85rem", color: "#742a2a" }}>
            Don't let the streak stay at zero. Feed the machine.
        </p>
        </div>
    ) : (
        <p style={{ margin: "10px 0 0 0", fontSize: "0.9rem", color: "#2f855a", fontWeight: "500" }}>
        Excellent. The system is active. Keep the momentum!
        </p>
    )}
    </div>

      {/* --- STATS SECTION --- */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(3, 1fr)", 
        gap: "15px", 
        marginBottom: "30px" 
      }}>
        <div style={statBoxStyle}>
          <h3 style={{ margin: "0", fontSize: "1.5rem" }}>{stats.total}</h3>
          <p style={{ margin: "5px 0 0 0", color: "#7f8c8d" }}>Total Apps</p>
        </div>
        <div style={statBoxStyle}>
          <h3 style={{ margin: "0", fontSize: "1.5rem", color: "#3498db" }}>{stats.responseRate}%</h3>
          <p style={{ margin: "5px 0 0 0", color: "#7f8c8d" }}>Response Rate</p>
        </div>
        <div style={statBoxStyle}>
          <h3 style={{ margin: "0", fontSize: "1.5rem", color: stats.followUps > 0 ? "#e74c3c" : "#2ecc71" }}>
            {stats.followUps}
          </h3>
          <p style={{ margin: "5px 0 0 0", color: "#7f8c8d" }}>Follow-ups Due</p>
        </div>
      </div>

      {/* --- ACTION REQUIRED SECTION --- */}
      <section>
        <h2 style={{ color: dueApps.length > 0 ? "#e74c3c" : "#2ecc71", borderBottom: "2px solid", paddingBottom: "10px" }}>
          {dueApps.length > 0 ? "🔥 Action Required" : "✅ You're all caught up!"}
        </h2>
        {dueApps.map(renderAppCard)}
      </section>

      <div style={{ height: "40px" }}></div>

      {/* --- ALL APPLICATIONS SECTION --- */}
      <section>
        <h2 style={{ color: "#2c3e50", borderBottom: "2px solid #bdc3c7", paddingBottom: "10px" }}>📄 All Applications</h2>
        {otherApps.length > 0 ? otherApps.map(renderAppCard) : <p style={{ textAlign: "center", color: "#95a5a6" }}>No applications found. Time to apply!</p>}
      </section>
    </div>
  );
}

export default Dashboard;