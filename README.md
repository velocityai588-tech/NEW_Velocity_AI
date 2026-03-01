# ⚡ Velocity AI

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Jira](https://img.shields.io/badge/Jira-0052CC?style=for-the-badge&logo=jira&logoColor=white)

**AI-powered project analytics and productivity intelligence platform**

[Features](#-features) • [Tech Stack](#-tech-stack) • [Getting Started](#-getting-started) • [Architecture](#-architecture)

</div>

---

## 📖 What is Velocity AI?

**Velocity AI** is an enterprise SaaS platform that connects to Jira via OAuth 2.0 and provides AI-driven analytics for engineering teams. It tracks project health, analyzes team capacity, matches employees to tasks based on skill profiles, automates leave approval decisions, and provides ROI reporting — all from a single dashboard.

The platform runs as a React SPA backed by an Express server. An external Python ML engine handles bottleneck detection, availability scoring, and capacity forecasting. Google Gemini AI powers contextual skill-to-task matching.

### Problems We Solve

- **📊 Data Visibility**: Consolidate Jira data across multiple sites into unified dashboards
- **👥 Resource Optimization**: AI-driven capacity planning and skill-based task matching
- **⏱️ Time Tracking**: Automated leave management with project impact analysis
- **🔮 Predictive Analytics**: ML-powered hotspot detection identifies at-risk projects
- **💰 ROI Measurement**: Quantify productivity improvements in monetary terms
- **🔥 Burnout Prevenion**: Monitor workload distribution and team capacity

---

## ✨ Features

### Core Capabilities

- **🔗 Jira Integration**
  - OAuth 2.0 multi-tenant authentication
  - Real-time issue tracking across multiple Jira Cloud sites
  - Sprint velocity metrics and burndown charts
  - Custom field support and advanced filtering

- **📈 Advanced Analytics**
  - Interactive Gantt charts (global and per-project)
  - Team capacity heatmaps and utilization tracking
  - 8-week capacity forecasting
  - At-risk project detection with hotspot scoring

- **🤖 AI-Powered Insights**
  - NLP-based skill extraction from issue descriptions
  - Predictive resource recommendations
  - Smart progress tracking
  - Automated causal attribution analysis

- **👨‍💼 Team Management**
  - Leave approval workflows
  - Automatic capacity adjustment for absences
  - Dynamic skill matrices from work history
  - Manager dashboards with team metrics

- **💵 Business Intelligence**
  - ROI calculator for productivity improvements
  - Revenue realization tracking
  - Time savings quantification
  - Executive summary reports

---

## 🛠️ Tech Stack

### Frontend
- **React 18.3** + **TypeScript 5.8** - Modern reactive UI
- **Vite 6.4** - Lightning-fast build tool
- **TailwindCSS 3.4** - Utility-first styling
- **Shadcn/UI + Radix** - Accessible component library
- **TanStack Query 5.83** - Data fetching & caching
- **React Router 6.30** - Client-side routing
- **Recharts + Chart.js** - Data visualizations
- **React Hook Form + Zod** - Forms & validation

### Backend
- **Node.js 18+** + **Express 5.2** - REST API server
- **TypeScript** - Type-safe backend code
- **Redis 4.6** - Session storage & caching
- **Express-Session** - OAuth session management

### Database & Auth
- **Supabase** - PostgreSQL backend & authentication
- **OAuth 2.0** - Jira Cloud integration (3-legged flow)

### AI & ML
- **Google Generative AI** - LLM-powered insights
- **Custom ML Engine** - Predictive analytics

### DevOps
- **Vercel** - Production deployment
- **ESLint 9.32** - Code quality
- **Vercel Analytics** - Usage metrics

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Dashboard  │  │  Jira Views  │  │ ROI Reports  │      │
│  │   Analytics  │  │ Gantt Charts │  │  Leave Mgmt  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API + React Query
┌────────────────────────▼────────────────────────────────────┐
│              Backend (Express + TypeScript)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Jira OAuth   │  │ Session Mgmt │  │ Data Normali │      │
│  │ Multi-tenant │  │ Redis Store  │  │ -zation      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───┬────────────────────┬───────────────────┬────────────────┘
    │                    │                   │
    ▼                    ▼                   ▼
┌──────────┐      ┌────────────┐     ┌────────────┐
│   Jira   │      │  Supabase  │     │   Redis    │
│   Cloud  │      │ PostgreSQL │     │   Cache    │
└──────────┘      └────────────┘     └────────────┘
```

### Key Components

**Pages**:
- `/` - Landing page with features & stats
- `/dashboard` - AI insights dashboard
- `/projects/jira-dashboard` - Jira-integrated analytics
- `/projects/:id` - Detailed project view with Gantt
- `/projects/global-gantt` - Cross-project capacity view
- `/roi-calculator` - ROI measurement tool
- `/progress` - Smart progress tracking

**API Routes** (server.ts):
- `GET /api/jira/auth/connect` - Initiate Jira OAuth
- `GET /api/jira/auth/callback` - OAuth callback handler
- `GET /api/jira/projects` - Fetch Jira projects
- `GET /api/jira/issues` - Fetch & filter issues
- `POST /api/jira/auth/switch-site` - Multi-tenant site switching
- `GET /api/jira/auth/status` - Connection status

**Key Hooks**:
- `useJiraData()` - Fetch & manage Jira issues with caching
- `useToast()` - Toast notifications
- `useMobile()` - Responsive design detection

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **npm** or **yarn**
- **Jira Cloud** account with admin access
- **Supabase** account
- **Redis** (optional, falls back to memory store)

### Environment Setup

1. **Clone the repository**
```bash
git clone https://github.com/velocityai588-tech/NEW_Velocity_AI.git
cd NEW_Velocity_AI
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
API_PORT=3001
FRONTEND_URL_PROD=https://www.joinvelocity.co

# Jira OAuth 2.0 (3-legged flow)
JIRA_CLIENT_ID=your_jira_client_id
JIRA_CLIENT_SECRET=your_jira_client_secret
JIRA_REDIRECT_URI=http://localhost:3001/api/jira/auth/callback

# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Session Management
SESSION_SECRET=your_random_session_secret

# Redis (Optional - production recommended)
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

4. **Set up Jira OAuth App**

   - Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
   - Create a new OAuth 2.0 integration
   - Add scopes: `read:jira-work`, `read:jira-user`, `offline_access`
   - Set callback URL: `http://localhost:3001/api/jira/auth/callback`
   - Copy Client ID and Client Secret to `.env`

5. **Start development servers**

```bash
# Terminal 1 - Backend API
npm run api

# Terminal 2 - Frontend dev server
npm run dev
```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

### Production Build

```bash
# Build frontend
npm run build

# Production mode
NODE_ENV=production npm run api
```

---

## 📁 Project Structure

```
NEW_Velocity_AI/
├── src/
│   ├── components/
│   │   ├── jira/                 # Jira integration components
│   │   │   ├── IssuesTable.tsx
│   │   │   ├── GanttChart.tsx
│   │   │   ├── ManagerGantt.tsx
│   │   │   └── ManagerSummary.tsx
│   │   ├── dashboard/            # Dashboard components
│   │   ├── leave-management/     # Leave tracking
│   │   ├── ml-model/             # ML insights
│   │   └── ui/                   # Shadcn UI components
│   ├── pages/
│   │   ├── Index.tsx             # Landing page
│   │   ├── JiraDashboard.tsx     # Main Jira analytics
│   │   ├── Projects.tsx          # Project management
│   │   └── Dashboard.tsx         # AI insights
│   ├── lib/
│   │   ├── api.ts                # API utilities
│   │   ├── leaveApprovalAgent.ts # Leave approval logic
│   │   └── normalizers/          # Data normalization
│   ├── contexts/
│   │   ├── AuthContext.tsx       # Auth state management
│   │   └── ToastContext.tsx      # Toast notifications
│   ├── api/
│   │   ├── jira/                 # Jira API routes
│   │   ├── leave-approval/       # Leave approval APIs
│   │   └── projects/             # Project APIs
│   ├── App.tsx                   # Main app component
│   └── main.tsx                  # Entry point
├── server.ts                     # Express backend server
├── api/                          # Serverless API routes
├── public/                       # Static assets
├── package.json                  # Dependencies
├── vite.config.ts                # Vite configuration
├── tailwind.config.ts            # Tailwind setup
└── tsconfig.json                 # TypeScript config
```

---

## 🔐 Security & Production

### Multi-Tenant Architecture
- OAuth 2.0 Authorization Code Flow (3-legged)
- Session-based token management with Redis
- Support for multiple Jira Cloud instances per user
- Secure cookie handling (SameSite=none, HttpOnly, Secure)

### Production Considerations
- **HTTPS Required**: OAuth flows require HTTPS in production
- **Redis Recommended**: Use Redis for session storage in multi-instance deployments
- **CORS Configured**: Properly configured for cross-origin requests
- **Session Timeout**: 24-hour sessions with automatic refresh
- **Trust Proxy**: Configured for Vercel/Nginx deployments

---

## 📊 Key Features in Detail

### Jira Integration
- **Multi-Site Support**: Connect and switch between multiple Jira Cloud instances
- **Real-Time Sync**: Live data updates with React Query caching
- **Advanced Filtering**: Filter issues by assignee, status, project, sprint
- **Custom Fields**: Support for custom Jira fields and workflows

### AI & ML Capabilities
- **Skill Extraction**: NLP extracts skills from issue descriptions
- **Hotspot Detection**: Identifies at-risk projects before delays occur
- **Resource Matching**: Suggests best team members for tasks
- **Predictive Analytics**: Forecasts project completion dates

### Analytics & Reporting
- **Gantt Charts**: Interactive timeline views with drag-and-drop
- **Burndown Charts**: Track sprint progress and velocity
- **Capacity Planning**: 8-week capacity forecasting with leave tracking
- **ROI Metrics**: Measure productivity gains in dollars and hours

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🌐 Links

- **Website**: [joinvelocity.co](https://www.joinvelocity.co)
- **Documentation**: [GitHub Wiki](https://github.com/velocityai588-tech/NEW_Velocity_AI/wiki)
- **Issues**: [GitHub Issues](https://github.com/velocityai588-tech/NEW_Velocity_AI/issues)

---

<div align="center">

**Built with ❤️ by the Velocity AI Team**

_Transforming project management with intelligent analytics_

</div>
