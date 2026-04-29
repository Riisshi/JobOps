import axios from 'axios';

const API = axios.create({ baseURL: process.env.REACT_APP_API_URL + '/api' });

// This automatically attaches the token to EVERY request
API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = `Bearer ${token}`; // ✅ Standard format
  }
  return req;
});

// Add a response interceptor to catch the 401
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login"; // Auto-kick to login
    }
    return Promise.reject(error);
  }
);

// Reminder API methods
export const getReminders = () => API.get("/reminders");
export const createReminder = (data) => API.post("/reminders", data);
export const updateReminder = (id, data) => API.put(`/reminders/${id}`, data);
export const deleteReminder = (id) => API.delete(`/reminders/${id}`);

// Application export
export const exportApplicationsCsv = () => API.get("/applications/export/csv", { responseType: "blob" });
export const exportApplicationsReport = () => API.get("/applications/export/report", { responseType: "text" });
export const getGamification = () => API.get("/automation/gamification");
export const getMarketIntelligence = () => API.get("/automation/market-intelligence");
export const runAutoFollowUps = () => API.post("/automation/auto-followups/run");
export const processDueNotifications = () => API.post("/automation/notifications/process-due");
export const getIntegrations = () => API.get("/automation/integrations");
export const updateIntegrations = (data) => API.put("/automation/integrations", data);
export const createShareToken = () => API.post("/automation/share-token");
export const getAutomationHints = (applicationId) => API.get(`/automation/hints/${applicationId}`);
export const getSharedPipeline = (token) => API.get(`/public/pipeline/${token}`);
export const getGmailAuthUrl = () => API.get("/automation/gmail/auth-url");
export const syncGmailReplies = () => API.post("/automation/gmail/sync-replies");
export const getGmailReviews = () => API.get("/automation/gmail/reviews");
export const confirmGmailReview = (id, status = "interview") => API.post(`/automation/gmail/reviews/${id}/confirm`, { status });
export const ignoreGmailReview = (id) => API.post(`/automation/gmail/reviews/${id}/ignore`);

export default API;
