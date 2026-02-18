# Velociy AI - Project Mnagement Dashboard

# Overview
Full-stack prductivity analytics platform that integrates with **Jira**, **Asan**, **HubSpot**, and **Microsoft 365** to provide real-time insights, Gantt charts, ROI calculations, and resource optimization..

**Stc:** React + TypeScript + Express +OAuth
## Arhitcture
``
┌────────────────────────────────────────────────────────────────┐
│                         FRONEND (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌───────┐  ┌──────────┐       
│  │   Jira   │  │  HubSpot │  │  Asana   │  │  M365    │       │
│  │Dashboard │ │Dahboard │  │Dahboard │  │\ │       │
│  └────┬─────┘  └────┬─────┘  └───┬─────┘  └────┬─────┘       │
│       │             │                        │           
│       └─────────────┴──────────────┴──────────────┘              │
│                         │                                        
│                  React Query (API Calls)                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER (Node.js)                      │
│                                                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │  Jira OAuth    │  │ HubSpot OAuth  │  │   M365 OAuth     │  │
│  │  /api/jira/*   │  │ /api/hubspot/* │  │ /api/microsoft*  │  │
│  └───────┬────────┘  └───────┬────────┘  └────────┬─────────┘  │
│          │                   │                     │             │
│          └───────────────────┴─────────────────────┘             │
│                              │                                   │
│                   Session Management                             │
│                   (express-session)                              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL APIs                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐            │
│  │ Jira Cloud  │  │  HubSpot    │  │ Microsoft    │            │
│  │ REST API    │  │  CRM API    │  │ Graph API    │            │
│  └─────────────┘  └─────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### 🔐 Authentication Endpoints

#### Jira OAuth
- `GET /api/jira/auth/connect` - Initiate Jira OAuth flow
- `GET /api/jira/auth/callback` - OAuth callback handler
- `GET /api/jira/auth/status` - Check connection status
- `POST /api/jira/auth/disconnect` - Disconnect Jira account
- `POST /api/jira/auth/switch-site/:siteId` - Switch between Jira sites

#### HubSpot OAuth
- `GET /api/hubspot/auth/connect` - Initiate HubSpot OAuth flow
- `GET /oauth/hubspot/callback` - OAuth callback handler
- `GET /api/hubspot/auth/status` - Check connection status
- `GET /api/hubspot/auth/disconnect` - Disconnect HubSpot account

#### Microsoft 365 OAuth
- `GET /api/microsoft365/auth/login` - Initiate M365 OAuth flow
- `GET /auth/callback` - OAuth callback handler
- `GET /api/microsoft365/auth/status` - Check connection status
- `GET /api/microsoft365/auth/logout` - Disconnect M365 account

---

### 📊 Data Endpoints

#### Jira
- `GET /api/jira/projects` - List all accessible projects
- `GET /api/jira/issues?projectKey={key}` - Fetch issues for a project
- `POST /api/jira/extract-employee-skills` - Extract employee skills from issues
- `POST /api/jira/save-employee-skills` - Save employee skills data

#### HubSpot
- `GET /api/hubspot/deals` - Fetch all deals
- `GET /api/hubspot/contacts` - Fetch all contacts
- `GET /api/hubspot/campaigns` - Fetch marketing campaigns
- `GET /api/hubspot/tickets` - Fetch support tickets
- `GET /api/hubspot/realization` - Calculate revenue realization metrics
- `GET /api/hubspot/ai-metrics` - Calculate AI-powered metrics

#### Asana
- `GET /api/asana/issues?projectKey={id}` - Fetch tasks from project
- `GET /api/asana/projects` - List all accessible projects

#### Microsoft 365
- `GET /api/microsoft365/metrics/meetings` - Fetch meeting analytics
- `GET /api/microsoft365/metrics/email` - Fetch email statistics
- `GET /api/microsoft365/metrics/chat` - Fetch Teams chat metrics
- `GET /api/microsoft365/metrics/focus` - Calculate focus time metrics
- `GET /api/microsoft365/oi` - Calculate M365 ROI metrics

---

## Data Flow

### 1️⃣ OAuth Authentication Flow
```
User clicks "Connect" → Frontend redirects to OAuth provider →
User authorizes → Provider redirects to callback →
Server exchanges code for tokens → Tokens stored in session →
Frontend receives auth status
```

### 2️⃣ Data Fetching Flow
```
Frontend component mounts → useQuery hook triggers →
HTTP request sent to Express server → Server validates session →
Server fetches data from external API using OAuth token →
Server transforms and normalizes data → JSON response sent →
Frontend updates UI with data
```

### 3️⃣ Multi-Tenant Session Management
```
Express session stores:
- OAuth access tokens (encrypted)
- Refresh tokens (for token renewal)
- Cloud/Portal IDs (for multi-tenant routing)
- User context (active site selection)

Session persistence:
- Development: In-memory store
- Production: Redis/Vercel KV store
```

---

## Frontend Routes

```
/                              → Landing page
/projects                      → Project selector
/projects/jira-dashboard       → Jira analytics dashboard
/projects/asana-dashboard      → Asana analytics dashboard
/projects/hubspot-dashboard    → HubSpot CRM analytics
/projects/microsoft365-dashboard → M365 productivity metrics
/projects/global-gantt         → Unified Gantt chart (all projects)
/roi-calculator                → ROI calculation tool
/velocity-ai                   → AI-powered insights
```

---

## Quick Start

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))
- npm (included with Node.js)

### Environment Variables
```bash
# Jira OAuth (deprecated - use OAuth instead)
JIRA_DOMAIN=your-company.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-token

# Asana
ASANA_TOKEN=your-personal-access-token
ASANA_PROJECT_ID=default-project-id

# HubSpot OAuth
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-secret
HUBSPOT_REDIRECT_URI=http://localhost:4000/oauth/hubspot/callback

# Jira OAuth
JIRA_OAUTH_CLIENT_ID=your-oauth-client-id
JIRA_OAUTH_CLIENT_SECRET=your-oauth-secret
JIRA_OAUTH_REDIRECT_URI=http://localhost:4000/api/jira/auth/callback

# Microsoft 365 OAuth
MICROSOFT_CLIENT_ID=your-azure-app-id
MICROSOFT_CLIENT_SECRET=your-azure-secret
MICROSOFT_REDIRECT_URI=http://localhost:4000/auth/callback

# Session
SESSION_SECRET=random-secret-string
okk
# Server
API_PORT=4000
FRONTEND_URL=http://localhost:5173
```

### Installation & Run
```bash
# Install dependencies
npm install

# Start backend (port 4000)
npm run api

# Start frontend (port 5173)
npm run dev
```

### Build for Production
```bash
npm run build
```

---

## Key Features

✅ **OAuth 2.0 Multi-Tenant** - Secure authentication for multiple platforms  
✅ **Real-Time Analytics** - Live dashboards with React Query  
✅ **Gantt Charts** - Visual project timelines  
✅ **ROI Calculator** - Productivity cost/benefit analysis  
✅ **Resource Optimization** - AI-powered skill matching  
✅ **Cross-Platform Integration** - Unified view across tools  

---

## Tech Stack

**Frontend:** React 18, TypeScript, TanStack Query, React Router, Shadcn/UI, Tailwind CSS  
**Backend:** Express.js, Node.js, TypeScript  
**Auth:** OAuth 2.0, express-session  
**APIs:** Jira Cloud API, HubSpot CRM API, Microsoft Graph API, Asana API  
**Build:** Vite, tsx  

---

## 🔍 Code Analysis Tools

This repository includes comprehensive code analysis tools to maintain code quality:

```bash
# Run complete analysis
npm run analyze
```

**What it analyzes:**
- 📊 Component size (finds components >300 lines)
- 🪝 Hook complexity (identifies hooks doing too much)
- 📦 Dependency analysis (files with 15+ imports)
- 🔄 Circular dependencies
- 🎯 Unused exports
- 📈 UI vs Logic ratio
- ⚙️ Code complexity metrics

**Documentation:**
- [Quick Start Guide](./ANALYSIS_QUICK_START.md)
- [Complete Analysis Guide](./CODE_ANALYSIS_GUIDE.md)

Reports are generated in `reports/` directory and `ANALYSIS_REPORT.md`.

---

## License
MIT
