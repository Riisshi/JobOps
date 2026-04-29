# JobOps

JobOps is a full-stack job hunt operating system focused on execution, not just tracking.

It combines application pipeline management, follow-up automation, Gmail reply sync, smart prioritization, review workflows, and analytics in one workspace.

## What is implemented

- Auth
  - Email/password login and register
  - Google OAuth login/register
  - JWT-protected APIs

- Application system
  - Create, update, delete applications
  - Status pipeline: applied, interview, offer, rejected
  - Notes, interview date/stage, job links, resume/cover letter links
  - Dedicated application detail page with timeline

- Follow-up engine
  - Follow-up cooldown/scheduling rules
  - Follow-up history tracking
  - Priority scoring and next-action logic
  - Rule-based follow-up suggestions

- Gmail integration (free mode)
  - Connect Gmail with OAuth
  - Sync recruiter replies from Gmail
  - Confidence-based matching
  - Review queue for low-confidence matches
  - Confirm/ignore workflow with audit trail
  - Duplicate protection for processed message IDs
  - Last sync diagnostics

- Intelligence and reporting
  - Dashboard KPIs
  - Weekly report snapshot
  - Funnel and follow-up impact analytics
  - Company response signals
  - CSV export
  - Print-ready HTML report for PDF export

- Product hardening
  - First-run onboarding checklist
  - Consistent feedback/error messaging layer
  - Integrations control page

## Tech stack

- Frontend: React
- Backend: Node.js, Express
- Database: MongoDB + Mongoose
- Mail sending: SendGrid
- OAuth: Google OAuth 2.0

## Local setup

### 1) Backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
MONGO_URI=your_mongodb_uri
PORT=5000
JWT_SECRET=your_jwt_secret

SENDGRID_API_KEY=your_sendgrid_key
EMAIL_FROM=your_verified_sender

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Gmail integration callback
GOOGLE_REDIRECT_URI=https://jobops-ts7r.onrender.com/api/automation/gmail/callback

# Login/Register OAuth callback
GOOGLE_AUTH_REDIRECT_URI=https://jobops-ts7r.onrender.com/api/auth/google/callback

# Frontend base URL for OAuth redirect
FRONTEND_URL=https://jobops-ts7r.onrender.com
```

> **For Production Deployment:** Update the above environment variables to use your production URLs (e.g., `https://your-domain.com/api/...`) in your hosting platform's environment variables.

Run backend:

```bash
npm start
```

### 2) Frontend

```bash
cd client
npm install
npm start
```

Frontend runs at `http://localhost:3000`

## Google OAuth setup (required)

In Google Cloud Console:

1. Create OAuth client (Web application)
2. Add these Authorized redirect URIs exactly:
   - `https://jobops-ts7r.onrender.com/api/auth/google/callback`
   - `https://jobops-ts7r.onrender.com/api/automation/gmail/callback`
3. Enable Gmail API
4. In OAuth consent screen (Testing mode), add your email under Test users

## Useful scripts

From repo root:

```bash
node scripts/stress-test.js
node scripts/system-validation.js
```

## Notes

- Gmail integration in this project is designed for local/testing workflows and free-mode constraints.
- AI/paid integrations are intentionally removed from active flow.

## Push to GitHub

```bash
git add .
git status
git commit -m "Polish UI/UX, harden onboarding/feedback, add OAuth + system validation updates"
git push origin <your-branch>
```

