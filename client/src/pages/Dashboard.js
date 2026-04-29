import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { getApiErrorMessage } from "../utils/feedback";
import Reminders from "./Reminders";
import "./Dashboard.css";

const STATUS_ORDER = ["applied", "interview", "offer", "rejected"];
const STATUS_LABEL = {
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

const STATUS_ACCENT = {
  applied: "neutral",
  interview: "blue",
  offer: "green",
  rejected: "red",
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const VIEW_META = {
  dashboard: {
    path: "/",
    title: "Dashboard",
    subtitle: "Track & manage your job applications",
  },
  applications: {
    path: "/applications",
    title: "Applications",
    subtitle: "Search, review, update, and maintain every application",
  },
  pipeline: {
    path: "/pipeline",
    title: "Pipeline",
    subtitle: "Move applications across each hiring stage",
  },
  calendar: {
    path: "/calendar",
    title: "Calendar",
    subtitle: "See upcoming follow-ups and interview reminders",
  },
  stats: {
    path: "/stats",
    title: "Stats",
    subtitle: "Measure your application momentum and outcomes",
  },
  reminders: {
    path: "/reminders",
    title: "Reminders",
    subtitle: "Manage follow-ups and task reminders",
  },
};

function Dashboard({ view = "dashboard" }) {
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    responseRate: 0,
    followUps: 0,
    interviewsPerWeek: 0,
    followUpsSent: 0,
    conversionRate: 0,
  });
  const [intelligence, setIntelligence] = useState(null);
  const [streak, setStreak] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    status: "all",
    priority: "all",
    company: "all",
    from: "",
    to: "",
  });
  const [sortMode, setSortMode] = useState("priority");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("jobops-theme") === "dark");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedActions, setDismissedActions] = useState([]);
  const [followUpFeedback, setFollowUpFeedback] = useState({});
  const [notesDrafts, setNotesDrafts] = useState({});
  const [interviewDrafts, setInterviewDrafts] = useState({});
  const [statusLoading, setStatusLoading] = useState({});
  const [followUpLoading, setFollowUpLoading] = useState({});
  const [notesLoading, setNotesLoading] = useState({});
  const [interviewLoading, setInterviewLoading] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState({});
  const [uiMessage, setUiMessage] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  });
  const navigate = useNavigate();
  const viewMeta = VIEW_META[view] || VIEW_META.dashboard;
  const [settingsDraft, setSettingsDraft] = useState(currentUser);
  const onboardingStorageKey = `jobops-onboarding-complete-${currentUser?.id || currentUser?.email || "anon"}`;

  useEffect(() => {
    const completed = localStorage.getItem(onboardingStorageKey) === "true";
    setOnboardingDismissed(completed);
  }, [onboardingStorageKey]);

  useEffect(() => {
    document.body.classList.toggle("jobops-dark", darkMode);
    localStorage.setItem("jobops-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const isDueTodayOrBefore = (dateString) => {
    if (!dateString) return false;
    const followUpDate = new Date(dateString);
    const today = new Date();
    followUpDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return followUpDate <= today;
  };

  const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  const toDateInputValue = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const getRelativeText = (dateString, fallback = "Recently") => {
    if (!dateString) return fallback;
    const diff = Math.floor((new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return "Today";
    if (diff === 1) return "1 day ago";
    if (diff < 7) return `${diff} days ago`;
    return formatDate(dateString);
  };

  const setLoadingFor = (setter, id, value) => {
    setter((prev) => ({ ...prev, [id]: value }));
  };

  const upsertApp = useCallback((updatedApp) => {
    setApps((prev) => prev.map((app) => (app._id === updatedApp._id ? { ...app, ...updatedApp } : app)));
  }, []);

  const removeApp = useCallback((id) => {
    setApps((prev) => prev.filter((app) => app._id !== id));
  }, []);

  const fetchApps = useCallback(async () => {
    const res = await API.get("/applications");
    setApps(res.data);
    setNotesDrafts((prev) => {
      const next = { ...prev };
      res.data.forEach((app) => {
        if (next[app._id] === undefined) next[app._id] = app.notes || "";
      });
      return next;
    });
    setInterviewDrafts((prev) => {
      const next = { ...prev };
      res.data.forEach((app) => {
        if (next[app._id] === undefined) next[app._id] = toDateInputValue(app.interviewDate);
      });
      return next;
    });
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const [statsRes, streakRes, intelligenceRes] = await Promise.all([
        API.get("/applications/stats"),
        API.get("/applications/streak"),
        API.get("/applications/intelligence"),
      ]);
      setStats(statsRes.data);
      setStreak(streakRes.data.streak);
      setIntelligence(intelligenceRes.data);
    } catch (err) {
      console.error("Failed to refresh metrics", err);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    setInitialLoading(true);
    setError(null);
    try {
      const [, , userRes] = await Promise.all([
        fetchApps(),
        refreshMetrics(),
        API.get("/auth/me").catch(() => null),
      ]);
      if (userRes?.data?.user) {
        setCurrentUser(userRes.data.user);
        setSettingsDraft(userRes.data.user);
        localStorage.setItem("user", JSON.stringify(userRes.data.user));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Unauthorized or server error"));
    } finally {
      setInitialLoading(false);
    }
  }, [fetchApps, refreshMetrics]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    fetchInitialData();
  }, [fetchInitialData, navigate]);

  const handleStatusChange = async (id, newStatus) => {
    const original = apps.find((app) => app._id === id);
    if (!original) return;

    setUiMessage(null);
    setLoadingFor(setStatusLoading, id, true);
    upsertApp({ ...original, status: newStatus });

    try {
      const res = await API.put(`/applications/${id}/status`, { status: newStatus });
      upsertApp(res.data);
      setInterviewDrafts((prev) => ({ ...prev, [id]: toDateInputValue(res.data.interviewDate) }));
      setUiMessage({ type: "success", text: "Status updated." });
      refreshMetrics();
    } catch (err) {
      upsertApp(original);
      setUiMessage({ type: "error", text: getApiErrorMessage(err, "Could not update status.") });
    } finally {
      setLoadingFor(setStatusLoading, id, false);
    }
  };

  const handleSaveInterviewDate = async (id) => {
    setUiMessage(null);
    setLoadingFor(setInterviewLoading, id, true);
    try {
      const res = await API.put(`/applications/${id}/interview`, {
        interviewDate: interviewDrafts[id] || null,
      });
      upsertApp(res.data);
      setInterviewDrafts((prev) => ({ ...prev, [id]: toDateInputValue(res.data.interviewDate) }));
      setUiMessage({ type: "success", text: "Interview date saved." });
      refreshMetrics();
    } catch (err) {
      setUiMessage({ type: "error", text: getApiErrorMessage(err, "Failed to save interview date.") });
    } finally {
      setLoadingFor(setInterviewLoading, id, false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setUiMessage(null);
    setSettingsSaving(true);
    try {
      const res = await API.put("/auth/me", settingsDraft);
      setCurrentUser(res.data.user);
      setSettingsDraft(res.data.user);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      setSettingsOpen(false);
      setUiMessage({ type: "success", text: "Settings updated." });
    } catch (err) {
      setUiMessage({ type: "error", text: getApiErrorMessage(err, "Failed to save settings.") });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDeleteApplication = async (id) => {
    const target = apps.find((app) => app._id === id);
    if (!target || !window.confirm("Delete this application?")) return;

    setUiMessage(null);
    setLoadingFor(setDeleteLoading, id, true);
    removeApp(id);

    try {
      await API.delete(`/applications/${id}`);
      setUiMessage({ type: "success", text: "Application deleted." });
      refreshMetrics();
    } catch (err) {
      setApps((prev) => [target, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      setUiMessage({ type: "error", text: getApiErrorMessage(err, "Failed to delete application.") });
    } finally {
      setLoadingFor(setDeleteLoading, id, false);
    }
  };

  const handleSaveNotes = async (id) => {
    setUiMessage(null);
    setLoadingFor(setNotesLoading, id, true);
    try {
      const res = await API.put(`/applications/${id}/notes`, { notes: notesDrafts[id] || "" });
      upsertApp(res.data);
      setUiMessage({ type: "success", text: "Notes saved." });
    } catch (err) {
      setUiMessage({ type: "error", text: getApiErrorMessage(err, "Failed to save notes.") });
    } finally {
      setLoadingFor(setNotesLoading, id, false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const response = await API.get("/applications/export/csv", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "jobops-applications.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setUiMessage({ type: "success", text: "Export downloaded." });
    } catch (err) {
      setUiMessage({ type: "error", text: "Failed to export CSV." });
    }
  };

  const handleFollowUp = async (app) => {
    setUiMessage(null);
    setLoadingFor(setFollowUpLoading, app._id, true);
    setFollowUpFeedback((prev) => ({ ...prev, [app._id]: null }));

    try {
      const res = await API.post(`/applications/${app._id}/send-followup`);
      if (res.data?.app) upsertApp(res.data.app);
      setFollowUpFeedback((prev) => ({ ...prev, [app._id]: res.data?.message || "Follow-up sent." }));
      setUiMessage({ type: "success", text: "Follow-up sent successfully." });
      refreshMetrics();
    } catch (err) {
      const apiError = getApiErrorMessage(err, "Failed to send email.");
      setFollowUpFeedback((prev) => ({ ...prev, [app._id]: apiError }));
      setUiMessage({ type: "error", text: apiError });
    } finally {
      setLoadingFor(setFollowUpLoading, app._id, false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const dueFollowUps = useMemo(
    () =>
      apps.filter((app) => {
        if (app.status !== "applied" || (app.followUpCount || 0) >= 3) return false;
        const firstReady = (app.followUpCount || 0) === 0 && !app.lastFollowUpSent;
        return firstReady || isDueTodayOrBefore(app.nextFollowUpDate);
      }),
    [apps]
  );

  const highPriorityApps = useMemo(() => apps.filter((app) => app.priority === "high"), [apps]);
  const interviewApps = useMemo(() => apps.filter((app) => app.status === "interview"), [apps]);
  const weekApplications = useMemo(() => {
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 6);
    thisWeekStart.setHours(0, 0, 0, 0);

    const previousWeekStart = new Date(thisWeekStart);
    previousWeekStart.setDate(thisWeekStart.getDate() - 7);

    const current = apps.filter((app) => new Date(app.appliedDate || app.createdAt) >= thisWeekStart).length;
    const previous = apps.filter((app) => {
      const date = new Date(app.appliedDate || app.createdAt);
      return date >= previousWeekStart && date < thisWeekStart;
    }).length;

    return {
      current,
      previous,
      delta: current - previous,
      progress: Math.min(Math.max(current * 14, 7), 100),
    };
  }, [apps]);

  const todayActions = useMemo(
    () =>
      [
        {
          key: "followups",
          icon: "send",
          title: `Send ${dueFollowUps.length} follow-ups`,
          detail: dueFollowUps.length ? "Due in next 24h" : "Nothing due today",
          count: dueFollowUps.length,
          filter: "due",
        },
        {
          key: "priority",
          icon: "flag",
          title: `Review ${highPriorityApps.length} high-priority`,
          detail: highPriorityApps.length ? "No response in 7+ days" : "No high-priority reviews",
          count: highPriorityApps.length,
          filter: "high",
        },
        {
          key: "interviews",
          icon: "calendar",
          title: `${interviewApps.length} interview scheduled`,
          detail: interviewApps.length ? "This week" : "No interview items",
          count: interviewApps.length,
          filter: "interview",
        },
      ].filter((item) => !dismissedActions.includes(item.key)),
    [dismissedActions, dueFollowUps.length, highPriorityApps.length, interviewApps.length]
  );

  const notificationItems = useMemo(() => todayActions.filter((item) => item.count > 0), [todayActions]);
  const companyOptions = useMemo(() => {
    return Array.from(new Set(apps.map((app) => app.company).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [apps]);

  const scoredActions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const actions = apps.flatMap((app) => {
      const output = [];
      const appliedDays = Math.floor((new Date() - new Date(app.appliedDate || app.createdAt)) / (1000 * 60 * 60 * 24));

      if (app.status === "applied") {
        const due = app.nextFollowUpDate && isDueTodayOrBefore(app.nextFollowUpDate);
        const noFirstFollowUp = (app.followUpCount || 0) === 0 && !app.lastFollowUpSent;
        const stale = appliedDays >= 10;
        const score = (due || noFirstFollowUp ? 75 : 0) + (stale ? 25 : 0) + ((app.priority === "high") ? 20 : 0);
        if (score > 0) {
          output.push({
            id: `${app._id}-followup`,
            score,
            icon: "send",
            title: `Follow up with ${app.company}`,
            detail: due ? "Follow-up is due now" : stale ? `${appliedDays} days without movement` : "First follow-up is ready",
            filter: "due",
            appId: app._id,
          });
        }
      }

      if (app.status === "interview") {
        if (!app.interviewDate) {
          output.push({
            id: `${app._id}-schedule-interview`,
            score: 85,
            icon: "calendar",
            title: `Schedule interview date for ${app.company}`,
            detail: "Interview stage needs a real date",
            filter: "interview",
            appId: app._id,
          });
        } else {
          const daysUntil = Math.ceil((new Date(app.interviewDate) - today) / (1000 * 60 * 60 * 24));
          if (daysUntil >= 0 && daysUntil <= 3) {
            output.push({
              id: `${app._id}-prep-interview`,
              score: 90 - daysUntil * 10,
              icon: "flag",
              title: `Prepare for ${app.company}`,
              detail: daysUntil === 0 ? "Interview is today" : `Interview in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
              filter: "interview",
              appId: app._id,
            });
          }
        }
      }

      return output;
    });

    return actions.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [apps]);

  const filteredApps = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return apps
      .filter((app) => {
        const matchesQuery = !query || [app.company, app.role, app.email, app.notes]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
        const matchesFilter =
          activeFilter === "all" ||
          (activeFilter === "high" && app.priority === "high") ||
          (activeFilter === "due" && dueFollowUps.some((due) => due._id === app._id)) ||
          (activeFilter === "interview" && app.status === "interview");
        const matchesStatus = filters.status === "all" || app.status === filters.status;
        const matchesPriority = filters.priority === "all" || app.priority === filters.priority;
        const matchesCompany = filters.company === "all" || app.company === filters.company;
        const appliedDate = new Date(app.appliedDate || app.createdAt);
        const matchesFrom = !filters.from || appliedDate >= new Date(filters.from);
        const matchesTo = !filters.to || appliedDate <= new Date(`${filters.to}T23:59:59`);

        return matchesQuery && matchesFilter && matchesStatus && matchesPriority && matchesCompany && matchesFrom && matchesTo;
      })
      .sort((a, b) => {
        if (sortMode === "priority") {
          const priorityDiff = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
          if (priorityDiff !== 0) return priorityDiff;
          return new Date(b.createdAt || b.appliedDate) - new Date(a.createdAt || a.appliedDate);
        }
        if (sortMode === "oldest") {
          return new Date(a.createdAt || a.appliedDate) - new Date(b.createdAt || b.appliedDate);
        }
        if (sortMode === "company") {
          return (a.company || "").localeCompare(b.company || "");
        }
        if (sortMode === "interviewDate") {
          const aDate = a.interviewDate ? new Date(a.interviewDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.interviewDate ? new Date(b.interviewDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        }
        if (sortMode === "followUp") {
          const aDate = a.nextFollowUpDate ? new Date(a.nextFollowUpDate).getTime() : Number.MAX_SAFE_INTEGER;
          const bDate = b.nextFollowUpDate ? new Date(b.nextFollowUpDate).getTime() : Number.MAX_SAFE_INTEGER;
          return aDate - bDate;
        }
        return new Date(b.createdAt || b.appliedDate) - new Date(a.createdAt || a.appliedDate);
      });
  }, [activeFilter, apps, dueFollowUps, filters, searchTerm, sortMode]);

  const groupedApps = useMemo(() => {
    const grouped = { applied: [], interview: [], offer: [], rejected: [] };
    filteredApps.forEach((app) => {
      if (grouped[app.status]) grouped[app.status].push(app);
    });
    return grouped;
  }, [filteredApps]);

  const quickFilters = [
    { key: "high", label: "High Priority", icon: "star", count: highPriorityApps.length },
    { key: "due", label: "Due Follow-ups", icon: "target", count: dueFollowUps.length },
    { key: "interview", label: "Interview", icon: "trophy", count: interviewApps.length },
  ];

  const upcomingItems = useMemo(() => {
    return apps
      .flatMap((app) => {
        const items = [];
        if (app.status === "applied" && app.nextFollowUpDate) {
          items.push({
            id: `${app._id}-followup`,
            date: app.nextFollowUpDate,
            type: "Follow-up",
            title: app.company,
            detail: app.role,
          });
        }
        if (app.status === "interview") {
          items.push({
            id: `${app._id}-interview`,
            date: app.interviewDate,
            type: "Interview",
            title: app.company,
            detail: app.interviewDate ? app.role : `${app.role} - date needed`,
            missingDate: !app.interviewDate,
          });
        }
        return items;
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return a.title.localeCompare(b.title);
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      });
  }, [apps]);

  const getFollowUpText = (app) => {
    if ((app.followUpCount || 0) === 0 && !app.lastFollowUpSent) return "First follow-up ready";
    if (!app.nextFollowUpDate) return app.status === "applied" ? "Follow-ups complete" : "Pipeline closed";
    if (isDueTodayOrBefore(app.nextFollowUpDate)) return "Follow-up due";
    return `Next ${formatDate(app.nextFollowUpDate)}`;
  };

  const renderIcon = (name) => (
    <span className={`jo-icon jo-icon-${name}`} aria-hidden="true" />
  );

  const navItems = [
    { key: "dashboard", label: "Dashboard", path: "/", icon: "grid" },
    { key: "applications", label: "Applications", path: "/applications", icon: "doc" },
    { key: "pipeline", label: "Pipeline", path: "/pipeline", icon: "pipeline" },
    { key: "calendar", label: "Calendar", path: "/calendar", icon: "calendar" },
    { key: "reminders", label: "Reminders", path: "/reminders", icon: "bell" },
    { key: "stats", label: "Stats", path: "/stats", icon: "chart" },
  ];

  const renderSortControl = () => (
    <label className="sort-control">
      {renderIcon("sort")}
      <span>Sort</span>
      <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
        <option value="priority">Priority</option>
        <option value="recent">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="company">Company</option>
        <option value="interviewDate">Interview Date</option>
        <option value="followUp">Follow-up Date</option>
      </select>
    </label>
  );

  const clearAdvancedFilters = () => {
    setFilters({ status: "all", priority: "all", company: "all", from: "", to: "" });
    setActiveFilter("all");
    setSearchTerm("");
  };

  const renderAdvancedFilters = () => (
    <section className="filter-panel">
      <div className="section-heading">
        <div>
          {renderIcon("filter")}
          <div>
            <h2>Advanced Filters</h2>
            <p>Keep the list usable when your pipeline gets large.</p>
          </div>
        </div>
        <button className="secondary-button" onClick={clearAdvancedFilters}>Reset</button>
      </div>
      <div className="filter-grid">
        <label>
          Status
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
          </select>
        </label>
        <label>
          Priority
          <select value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}>
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Company
          <select value={filters.company} onChange={(e) => setFilters((prev) => ({ ...prev, company: e.target.value }))}>
            <option value="all">All companies</option>
            {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
          </select>
        </label>
        <label>
          Applied From
          <input type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
        </label>
        <label>
          Applied To
          <input type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
        </label>
      </div>
    </section>
  );

  const renderAppCard = (app) => {
    const isFirstFollowUpReady = (app.followUpCount || 0) === 0 && !app.lastFollowUpSent;
    const isMaxFollowUpsReached = app.nextFollowUpDate === null;
    const isCoolingDown = !isFirstFollowUpReady && !isMaxFollowUpsReached && !isDueTodayOrBefore(app.nextFollowUpDate);
    const isFollowUpLocked = isMaxFollowUpsReached || isCoolingDown || app.status !== "applied";
    const isStatusBusy = !!statusLoading[app._id];
    const isFollowBusy = !!followUpLoading[app._id];
    const isDeleteBusy = !!deleteLoading[app._id];
    const isNotesBusy = !!notesLoading[app._id];
    const isInterviewBusy = !!interviewLoading[app._id];

    return (
      <article className="app-card" key={app._id}>
        <div className="app-card-main">
          <div className="company-mark">{app.company?.charAt(0)?.toUpperCase() || "J"}</div>
          <div className="app-copy">
            <div className="app-title-row">
              <button className="app-title-link" onClick={() => navigate(`/applications/${app._id}`)}>
                {app.company}
              </button>
              <span className={`priority-pill priority-${app.priority || "low"}`}>{app.priority || "Low"}</span>
            </div>
            <p>{app.role}</p>
            <span>
              {app.status === "applied"
                ? `Applied ${getRelativeText(app.appliedDate).toLowerCase()}`
                : `${STATUS_LABEL[app.status]} ${getRelativeText(app.lastActionDate).toLowerCase()}`}
            </span>
          </div>
        </div>

        <div className="app-meta-row">
          <span>{renderIcon("clock")} {getFollowUpText(app)}</span>
          <span>{renderIcon("message")} {app.followUpCount || 0}</span>
        </div>

        {followUpFeedback[app._id] && <p className="feedback-text">{followUpFeedback[app._id]}</p>}

        <div className="card-controls">
          <select
            value={app.status}
            disabled={isStatusBusy}
            onChange={(e) => handleStatusChange(app._id, e.target.value)}
            aria-label={`Change status for ${app.company}`}
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>{STATUS_LABEL[status]}</option>
            ))}
          </select>
          <button
            className="icon-button"
            onClick={() => handleFollowUp(app)}
            disabled={isFollowBusy || isFollowUpLocked}
            title="Send follow-up"
            aria-label="Send follow-up"
          >
            {renderIcon("send")}
          </button>
          <button
            className="icon-button danger"
            onClick={() => handleDeleteApplication(app._id)}
            disabled={isDeleteBusy}
            title="Delete application"
            aria-label="Delete application"
          >
            {isDeleteBusy ? "..." : renderIcon("trash")}
          </button>
        </div>
        <button className="detail-link-button" onClick={() => navigate(`/applications/${app._id}`)}>
          View details
        </button>

        {app.status === "interview" && (
          <div className="interview-date-row">
            <label>
              Interview date
              <input
                type="date"
                value={interviewDrafts[app._id] || ""}
                onChange={(e) => setInterviewDrafts((prev) => ({ ...prev, [app._id]: e.target.value }))}
              />
            </label>
            <button className="small-button" onClick={() => handleSaveInterviewDate(app._id)} disabled={isInterviewBusy}>
              {isInterviewBusy ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        <details className="notes-drawer">
          <summary>Notes</summary>
          <textarea
            rows={3}
            value={notesDrafts[app._id] ?? app.notes ?? ""}
            onChange={(e) => setNotesDrafts((prev) => ({ ...prev, [app._id]: e.target.value }))}
            placeholder="Recruiter, context, next steps"
          />
          <button className="small-button" onClick={() => handleSaveNotes(app._id)} disabled={isNotesBusy}>
            {isNotesBusy ? "Saving..." : "Save notes"}
          </button>
        </details>
      </article>
    );
  };

  const renderStatsCards = () => (
    <section className="stats-grid">
      <div className="stat-card">{renderIcon("doc")}<strong>{stats.total}</strong><span>Total Applications</span><small>+ {stats.followUps} due this week</small></div>
      <div className="stat-card progress-card">{renderIcon("chart")}<strong>{stats.responseRate}%</strong><span>Response Rate</span><div className="mini-ring">{stats.responseRate}%</div></div>
      <div className="stat-card">{renderIcon("trend")}<strong>{stats.interviewsPerWeek}</strong><span>Interviews</span><small>+ this week</small></div>
      <div className="stat-card">{renderIcon("mail")}<strong>{stats.followUpsSent}</strong><span>Follow-ups Sent</span><small>+ active outreach</small></div>
      <div className="stat-card">{renderIcon("trophy")}<strong>{streak}</strong><span>Day Streak</span><small>Keep it up</small></div>
    </section>
  );

  const renderPipelineBoard = () => (
    <section className="pipeline-board">
      {STATUS_ORDER.map((status) => (
        <div className={`pipeline-column ${STATUS_ACCENT[status]}`} key={status}>
          <div className="column-title">
            <h3>{STATUS_LABEL[status]}</h3>
            <span>{groupedApps[status].length}</span>
          </div>
          {groupedApps[status].length ? groupedApps[status].map(renderAppCard) : <p className="empty-column">No applications</p>}
          {status === "applied" && (
            <button className="add-column-button" onClick={() => navigate("/add")}>+ Add application</button>
          )}
        </div>
      ))}
    </section>
  );

  const renderDashboardHome = () => (
    <>
      {showOnboardingGuide && (
        <section className="onboarding-card">
          <div className="onboarding-header">
            <div>
              <h2>Start Here</h2>
              <p>Complete these 3 steps to get value from JobOps in under 2 minutes.</p>
              <p className="onboarding-progress-text">{onboardingProgress}/3 completed</p>
              <div className="onboarding-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={onboardingProgress}>
                <i style={{ width: `${(onboardingProgress / 3) * 100}%` }} />
              </div>
            </div>
            <button className="secondary-button" onClick={handleDismissOnboarding}>Hide</button>
          </div>
          <div className="onboarding-steps">
            <button className={`onboarding-step ${onboardingState.hasApplication ? "done" : ""}`} onClick={() => navigate("/add")}>
              <strong>1. Add your first application</strong>
              <span>{onboardingState.hasApplication ? "Done" : "Add company, role, and recruiter email."}</span>
            </button>
            <button className={`onboarding-step ${onboardingState.visitedActions ? "done" : ""}`} onClick={handleVisitActionsStep}>
              <strong>2. Review Today&apos;s Actions</strong>
              <span>{onboardingState.visitedActions ? "Done" : "See your top priorities and focus list."}</span>
            </button>
            <button
              className={`onboarding-step ${onboardingState.sentFollowUp ? "done" : ""}`}
              onClick={onboardingState.hasDueFollowUps ? handleOpenDueFollowUps : () => setUiMessage({ type: "error", text: "No follow-up due yet. Add an application first." })}
            >
              <strong>3. Send your first follow-up</strong>
              <span>
                {onboardingState.sentFollowUp
                  ? "Done"
                  : onboardingState.hasDueFollowUps
                    ? "Open due follow-ups and send one."
                    : "Will unlock when a follow-up is due."}
              </span>
            </button>
          </div>
        </section>
      )}
      <section className="actions-card">
        <div className="section-heading">
          <div>
            {renderIcon("bolt")}
            <div>
              <h2>Today's Actions</h2>
              <p>{scoredActions.length || 0} priorities ranked by urgency</p>
            </div>
          </div>
          <button className="secondary-button" onClick={() => setDismissedActions(todayActions.map((item) => item.key))}>
            {renderIcon("calendar")} Mark all done
          </button>
        </div>
        <div className="action-grid">
          {scoredActions.map((item) => (
            <button key={item.id} className="action-tile" onClick={() => navigate(`/applications/${item.appId}`)}>
              {renderIcon(item.icon)}
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              {renderIcon("chevron")}
            </button>
          ))}
          {!scoredActions.length && <p className="empty-inline">You're caught up.</p>}
        </div>
      </section>

      {renderStatsCards()}
      <section className="pipeline-heading">
        <h2>Application Pipeline</h2>
        <div>
          {renderSortControl()}
          <button className="icon-button" onClick={() => setAdvancedFiltersOpen((open) => !open)} aria-label="Advanced filters">
            {renderIcon("filter")}
          </button>
        </div>
      </section>
      {advancedFiltersOpen && renderAdvancedFilters()}
      {renderPipelineBoard()}
    </>
  );

  const renderApplicationsPage = () => (
    <section className="list-panel">
      <div className="section-heading">
        <div>
          {renderIcon("doc")}
          <div>
            <h2>All Applications</h2>
            <p>{filteredApps.length} matching applications</p>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-button" onClick={handleExportCsv}>
            Export CSV
          </button>
          {renderSortControl()}
          <button className="secondary-button" onClick={() => setAdvancedFiltersOpen((open) => !open)}>
            {renderIcon("filter")} Filters
          </button>
        </div>
      </div>
      {advancedFiltersOpen && renderAdvancedFilters()}
      <div className="application-list">
        {filteredApps.length ? filteredApps.map(renderAppCard) : <p className="empty-column">No applications match your filters.</p>}
      </div>
    </section>
  );

  const renderCalendarPage = () => (
    <section className="list-panel calendar-panel">
      <div className="section-heading">
        <div>
          {renderIcon("calendar")}
          <div>
            <h2>Upcoming Work</h2>
            <p>Follow-ups and interview check-ins sorted by date</p>
          </div>
        </div>
      </div>
      <div className="timeline-list">
        {upcomingItems.length ? upcomingItems.map((item) => (
          <article className="timeline-item" key={item.id}>
            <div>
              <strong>{item.date ? formatDate(item.date) : "Unscheduled"}</strong>
              <span>{item.type}</span>
            </div>
            <section>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </section>
          </article>
        )) : <p className="empty-column">No scheduled follow-ups or interviews yet.</p>}
      </div>
    </section>
  );

  const renderPipelinePage = () => (
    <>
      <section className="pipeline-heading">
        <h2>Application Pipeline</h2>
        <div>
          {renderSortControl()}
          <button className="icon-button" onClick={() => setAdvancedFiltersOpen((open) => !open)} aria-label="Advanced filters">
            {renderIcon("filter")}
          </button>
        </div>
      </section>
      {advancedFiltersOpen && renderAdvancedFilters()}
      {renderPipelineBoard()}
    </>
  );

  const renderStatsPage = () => (
    <>
      {renderStatsCards()}
      {intelligence && (
        <>
          <section className="report-card">
            <div>
              <span>Weekly Report</span>
              <h2>This week: {intelligence.weeklyReport.applications} applications, {intelligence.weeklyReport.interviews} interviews, {intelligence.weeklyReport.offers} offers</h2>
              <p>
                Applications {intelligence.weeklyReport.applicationDelta >= 0 ? "up" : "down"} by {Math.abs(intelligence.weeklyReport.applicationDelta)} vs last week.
                Response rate changed by {intelligence.weeklyReport.responseRateDelta >= 0 ? "+" : ""}{intelligence.weeklyReport.responseRateDelta}%.
              </p>
            </div>
          </section>

          <section className="analytics-grid">
            <article className="analytics-card">
              <h2>Conversion Funnel</h2>
              <div className="funnel-list">
                {intelligence.funnel.map((stage) => (
                  <div key={stage.stage}>
                    <span>{stage.stage}</span>
                    <strong>{stage.count}</strong>
                    <div><i style={{ width: `${stage.rate}%` }} /></div>
                    <small>{stage.rate}%</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="analytics-card">
              <h2>Top Priority Scores</h2>
              <div className="priority-score-list">
                {intelligence.priorityList.length ? intelligence.priorityList.map((item) => (
                  <button key={item.id} onClick={() => navigate(`/applications/${item.id}`)}>
                    <span>
                      <strong>{item.company}</strong>
                      <small>{item.reasons[0] || item.role}</small>
                    </span>
                    <b>{item.score}</b>
                  </button>
                )) : <p className="empty-column">No urgent priorities right now.</p>}
              </div>
            </article>
          </section>

          <section className="analytics-grid">
            <article className="analytics-card">
              <h2>Company Response Signals</h2>
              <div className="insight-table">
                {intelligence.companyInsights.length ? intelligence.companyInsights.map((item) => (
                  <div key={item.company}>
                    <strong>{item.company}</strong>
                    <span>{item.applications} apps</span>
                    <span>{item.responseRate}% response</span>
                  </div>
                )) : <p className="empty-column">Add more applications to reveal company patterns.</p>}
              </div>
            </article>

            <article className="analytics-card">
              <h2>Follow-up Impact</h2>
              <div className="insight-table">
                {intelligence.followUpBuckets.map((item) => (
                  <div key={item.followUps}>
                    <strong>{item.followUps} follow-ups</strong>
                    <span>{item.applications} apps</span>
                    <span>{item.responseRate}% response</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}
      <section className="insight-grid">
        <article>
          <span>Conversion Rate</span>
          <strong>{stats.conversionRate}%</strong>
          <p>Offers from total applications.</p>
        </article>
        <article>
          <span>Active Pipeline</span>
          <strong>{Math.max(stats.total - (stats.pipeline?.rejected || 0), 0)}</strong>
          <p>Applications that are still alive.</p>
        </article>
        <article>
          <span>Weekly Applications</span>
          <strong>{weekApplications.current}</strong>
          <p>{weekApplications.delta >= 0 ? "+" : ""}{weekApplications.delta} compared with the previous 7 days.</p>
        </article>
      </section>
    </>
  );

  const renderCurrentView = () => {
    if (view === "applications") return renderApplicationsPage();
    if (view === "pipeline") return renderPipelinePage();
    if (view === "calendar") return renderCalendarPage();
    if (view === "stats") return renderStatsPage();
    if (view === "reminders") return <Reminders embedded />;
    return renderDashboardHome();
  };
  const onboardingState = {
    hasApplication: apps.length > 0,
    visitedActions: localStorage.getItem(`${onboardingStorageKey}-actions`) === "true",
    sentFollowUp: apps.some((app) => (app.followUpCount || 0) > 0),
    hasDueFollowUps: dueFollowUps.length > 0,
  };
  const onboardingCompleted = onboardingState.hasApplication && onboardingState.visitedActions && onboardingState.sentFollowUp;
  const onboardingProgress = [onboardingState.hasApplication, onboardingState.visitedActions, onboardingState.sentFollowUp].filter(Boolean).length;
  const showOnboardingGuide = view === "dashboard" && !onboardingDismissed && !onboardingCompleted;

  const handleDismissOnboarding = () => {
    localStorage.setItem(onboardingStorageKey, "true");
    setOnboardingDismissed(true);
  };

  const handleVisitActionsStep = () => {
    localStorage.setItem(`${onboardingStorageKey}-actions`, "true");
    setUiMessage({ type: "success", text: "Great. You can now focus on Today's Actions below." });
  };

  const handleOpenDueFollowUps = () => {
    setActiveFilter("due");
    setUiMessage({ type: "success", text: "Filtered to due follow-ups. Send one to complete onboarding." });
  };

  const handleResetOnboarding = () => {
    localStorage.removeItem(onboardingStorageKey);
    localStorage.removeItem(`${onboardingStorageKey}-actions`);
    setOnboardingDismissed(false);
    setUiMessage({ type: "success", text: "Onboarding reset. Guide is visible again." });
  };

  useEffect(() => {
    if (onboardingCompleted) {
      localStorage.setItem(onboardingStorageKey, "true");
      setOnboardingDismissed(true);
    }
  }, [onboardingCompleted, onboardingStorageKey]);

  if (initialLoading) return <div className="dashboard-shell centered-state">Loading...</div>;
  if (error) return <div className="dashboard-shell centered-state error-state">{error}</div>;

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("/")}>
          {renderIcon("briefcase")}
          <span>Job<strong>Ops</strong></span>
        </button>

        <nav className="side-nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={view === item.key ? "active" : ""}
              onClick={() => navigate(item.path)}
            >
              {renderIcon(item.icon)} {item.label}
            </button>
          ))}
        </nav>

        <div className="quick-filter-block">
          <h2>Quick Filters</h2>
          {quickFilters.map((filter) => (
            <button
              key={filter.key}
              className={activeFilter === filter.key ? "selected" : ""}
              onClick={() => setActiveFilter(activeFilter === filter.key ? "all" : filter.key)}
            >
              {renderIcon(filter.icon)}
              <span>{filter.label}</span>
              <b>{filter.count}</b>
            </button>
          ))}
        </div>

        <div className="week-card">
          <div className="ring-progress" style={{ "--progress": `${weekApplications.progress}%` }}>
            <span>{weekApplications.current}</span>
          </div>
          <div>
            <p>This Week</p>
            <strong>Applications</strong>
          </div>
          <small>{weekApplications.delta >= 0 ? "+" : ""} {weekApplications.delta} from last week</small>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <label className="search-box">
            {renderIcon("search")}
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search applications..."
            />
            <kbd>Ctrl K</kbd>
          </label>

          <div className="topbar-actions">
            <div className="notification-wrap">
              <button
                className="icon-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label="Notifications"
              >
                {renderIcon("bell")}
                {notificationItems.length > 0 && <span className="badge">{notificationItems.length}</span>}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div>
                    <strong>Notifications</strong>
                    <button onClick={() => setDismissedActions(todayActions.map((item) => item.key))}>Clear</button>
                  </div>
                  {notificationItems.length ? (
                    notificationItems.map((item) => (
                      <button key={item.key} onClick={() => setActiveFilter(item.filter)}>
                        {renderIcon(item.icon)}
                        <span>{item.title}</span>
                      </button>
                    ))
                  ) : (
                    <p>No notifications right now.</p>
                  )}
                </div>
              )}
            </div>
            <button className="icon-button" onClick={() => setDarkMode((value) => !value)} aria-label="Toggle dark mode">
              {renderIcon(darkMode ? "moon" : "sun")}
            </button>
            <div className="profile-wrap">
              <button
                className="profile-button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-label="Open account menu"
              >
                <span>{(currentUser.name || currentUser.email || "U").charAt(0).toUpperCase()}</span>
                <strong>{currentUser.name || currentUser.email || "User"}</strong>
                {renderIcon("chevron")}
              </button>
              {profileMenuOpen && (
                <div className="profile-menu">
                  <div>
                    <strong>{currentUser.name || "User"}</strong>
                    <span>{currentUser.email || "No email found"}</span>
                  </div>
                  <button onClick={() => { setSettingsDraft(currentUser); setSettingsOpen(true); setProfileMenuOpen(false); }}>
                    {renderIcon("settings")} Settings
                  </button>
                  <button onClick={() => { navigate("/stats"); setProfileMenuOpen(false); }}>
                    {renderIcon("chart")} View stats
                  </button>
                  <button onClick={() => { navigate("/integrations"); setProfileMenuOpen(false); }}>
                    {renderIcon("settings")} Integrations
                  </button>
                  <button onClick={() => { handleResetOnboarding(); setProfileMenuOpen(false); }}>
                    {renderIcon("target")} Show onboarding again
                  </button>
                  <button onClick={handleLogout}>{renderIcon("logout")} Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <h1>{viewMeta.title}</h1>
            <p>{viewMeta.subtitle}</p>
          </div>
          <button className="primary-button" onClick={() => navigate("/add")}>
            {renderIcon("plus")} Add Application
          </button>
        </section>

        {uiMessage && <div className={`toast ${uiMessage.type}`}>{uiMessage.text}</div>}
        {renderCurrentView()}

        {settingsOpen && (
          <div className="modal-backdrop" role="presentation">
            <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
              <div className="section-heading">
                <div>
                  {renderIcon("settings")}
                  <div>
                    <h2 id="settings-title">Account Settings</h2>
                    <p>Keep your profile details ready for follow-ups and reminders.</p>
                  </div>
                </div>
                <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                  {renderIcon("close")}
                </button>
              </div>

              <form className="settings-form" onSubmit={handleSaveSettings}>
                <label>
                  Full name
                  <input
                    value={settingsDraft.name || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Email
                  <input value={settingsDraft.email || ""} disabled />
                </label>
                <label>
                  Phone
                  <input
                    value={settingsDraft.phone || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </label>
                <label>
                  Location
                  <input
                    value={settingsDraft.location || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, location: e.target.value }))}
                  />
                </label>
                <label>
                  Target role
                  <input
                    value={settingsDraft.targetRole || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, targetRole: e.target.value }))}
                  />
                </label>
                <label>
                  Timezone
                  <input
                    value={settingsDraft.timezone || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, timezone: e.target.value }))}
                    placeholder="Asia/Kolkata"
                  />
                </label>
                <label>
                  LinkedIn URL
                  <input
                    value={settingsDraft.linkedinUrl || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
                  />
                </label>
                <label>
                  Portfolio URL
                  <input
                    value={settingsDraft.portfolioUrl || ""}
                    onChange={(e) => setSettingsDraft((prev) => ({ ...prev, portfolioUrl: e.target.value }))}
                  />
                </label>
                <div className="form-actions settings-actions">
                  <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={settingsSaving}>
                    {settingsSaving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
