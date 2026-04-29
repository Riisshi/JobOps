import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../utils/feedback";
import "./Dashboard.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.toggle("jobops-dark", localStorage.getItem("jobops-theme") === "dark");
    const query = new URLSearchParams(window.location.search);
    const oauthToken = query.get("token");
    const oauthState = query.get("oauth");
    const oauthMessage = query.get("message");
    if (oauthToken && oauthState === "success") {
      localStorage.setItem("token", oauthToken);
      localStorage.setItem("user", JSON.stringify({}));
      navigate("/");
      return;
    }
    if (oauthState === "error") {
      setError(oauthMessage || "Google sign-in failed.");
    }
  }, []);

  const handleGoogleLogin = async () => {
    setError("");
    try {
      const response = await fetch(process.env.REACT_APP_API_URL + "/api/auth/google/url?mode=login");
      const data = await response.json();
      if (!response.ok || !data?.authUrl) {
        setError(data?.error || "Could not start Google login.");
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not start Google login."));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(process.env.REACT_APP_API_URL + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.msg || data.error || "Invalid credentials");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user || {}));
      navigate("/");
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed. Please check that the server is running."));
    } finally {
      setLoading(false);
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
          <h1>Login</h1>
          <p>Open your application workspace and keep the pipeline moving.</p>
        </div>

        {error && <div className="toast error">{error}</div>}

        <form onSubmit={handleSubmit} className="application-form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <div className="form-actions">
            <Link className="auth-link" to="/register">Create account</Link>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={handleGoogleLogin}>
              Continue with Google
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default Login;
