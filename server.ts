import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

// Load .env FIRST before any other imports
// Get working directory to find .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

import express from "express"
import type { Request, Response } from "express"

import cors from "cors"
import fetch from "node-fetch"
import { createClient } from '@supabase/supabase-js';
import session from "express-session"

// Initialize Redis store asynchronously
let redisStore: any = null;

async function initializeRedis() {
  try {
    if (!process.env.REDIS_URL && !(process.env.REDIS_HOST && process.env.REDIS_PORT)) {
      console.log('[Server] No Redis config found, using memory store');
      return;
    }

    const redis = await import('redis');
    const { default: RedisStore } = await import('connect-redis');
    
    const redisClient = redis.createClient({
      url: process.env.REDIS_URL || `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    });
    
    redisClient.on('error', (err: any) => console.error('[Redis] Error:', err));
    redisClient.on('connect', () => console.log('[Redis] Connected'));
    
    await redisClient.connect();
    redisStore = new RedisStore({ client: redisClient, prefix: 'velocity-session:' });
    console.log('[Server] Redis session store initialized');
  } catch (err) {
    console.log('[Server] Redis initialization failed, using memory store:', err instanceof Error ? err.message : String(err));
  }
}

// Static imports
import jiraRoutes from "./src/api/jira/routes.js"
import deployedRoutes from "./src/api/deployed/routes.js"
import leaveApprovalRoutes from "./src/api/leave-approval/routes.js"
const app = express()

console.log("typeof express:", typeof express)
console.log("express keys:", Object.keys(express))

// Trust proxy for Vercel/Nginx - required for Secure cookies to work behind proxy
app.set('trust proxy', 1)

// Simple request logger to help debugging route matching
app.use((req: Request, res: Response, next) => {
  console.log('[REQ]', req.method, req.url, 'headers:', { host: req.headers.host, origin: req.headers.origin })
  next()
})

// CORS configuration for cross-origin requests
const corsOrigin = process.env.NODE_ENV === 'production' 
  ? (process.env.FRONTEND_URL_PROD || 'https://www.joinvelocity.co')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())
// CRITICAL: SameSite=none + Secure=true required for OAuth redirects (Provider -> App)
const sessionConfig: any = {
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: true, // Save session on every request to persist data
  saveUninitialized: true, // Initialize session even if unmodified
  name: 'velocity-sid', // Custom session ID cookie name
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true in production (HTTPS required)
    httpOnly: true, // Prevent XSS attacks
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' allows cross-site (OAuth), 'lax' for localhost
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    // Set proper domain for production
    domain: process.env.NODE_ENV === 'production' ? '.joinvelocity.co' : undefined
  }
};

// Add Redis store if available, otherwise use memory store
if (redisStore) {
  sessionConfig.store = redisStore;
  console.log('[Server] Using Redis store for sessions');
} else {
  console.log('[Server] Using memory store for sessions (dev only)');
}

app.use(session(sessionConfig))
console.log('[Server] Session middleware registered')

// ============ CAPACITY ENDPOINT (must be AFTER session middleware) ============
app.post('/api/v1/analyze/capacity', (req: Request, res: Response) => {
  console.log('[Capacity] POST /api/v1/analyze/capacity hit!');
  try {
    const candidates = req.body?.candidates;
    if (!Array.isArray(candidates)) {
      return res.status(400).json({ error: 'Missing or invalid candidates array' });
    }

    const results = candidates.map((c: any) => {
      const base = Number(c.base_productive_hours ?? 40);
      const efficiency = Number(c.efficiency_score ?? 1);
      const currentLoad = Number(c.current_load ?? 0);
      const pto = Number(c.pto_hours_this_week ?? 0);
      const holiday = Number(c.holiday_hours_this_week ?? 0);
      const available = Math.max(0, Math.round((base * efficiency - currentLoad - pto - holiday) * 100) / 100);
      return {
        id: c.id ?? c.name,
        name: c.name ?? 'Unknown',
        base_productive_hours: base,
        efficiency_score: efficiency,
        current_load: currentLoad,
        pto_hours_this_week: pto,
        holiday_hours_this_week: holiday,
        available_hours: available,
      };
    });

    const team_total = results.reduce((s: number, r: any) => s + (r.available_hours || 0), 0);
    return res.json({ team_total, results });
  } catch (err) {
    console.error('[Capacity] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
console.log('[Server] Capacity POST endpoint registered at /api/v1/analyze/capacity');

// ============ Enable Jira, Deployed, and Leave-Approval routers ============
app.use('/api/jira', jiraRoutes);
console.log('[Server] Jira OAuth routes mounted at /api/jira');

app.use('/api/deployed', deployedRoutes);
console.log('[Server] Deployed routes mounted at /api/deployed');

app.use('/api/leave-approval', leaveApprovalRoutes);
console.log('[Server] Leave Approval Agent routes mounted at /api/leave-approval');

const PORT = Number(process.env.API_PORT || 4000)
const NODE_ENV = process.env.NODE_ENV || 'development'

console.log(`[Server] Starting in ${NODE_ENV} mode on port ${PORT}`)
console.log(`[Server] Frontend URL: ${process.env.FRONTEND_URL_PROD || 'http://localhost:5173'}`)

// ============ JIRA Configuration ============
const DOMAIN = process.env.JIRA_DOMAIN
const EMAIL = process.env.JIRA_EMAIL
const API_TOKEN = process.env.JIRA_API_TOKEN
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY
const TEAM_FIELD = process.env.JIRA_TEAM_FIELD_ID // Optional custom field key, e.g. customfield_12345

let auth = ''
if (EMAIL && API_TOKEN) {
  auth = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64")
  console.log('[Jira] Auth configured for email:', EMAIL)
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const isJiraConfigReady = DOMAIN && EMAIL && API_TOKEN && PROJECT_KEY
if (!isJiraConfigReady) {
  console.warn("[Jira] Configuration incomplete:", { domain: !!DOMAIN, email: !!EMAIL, token: !!API_TOKEN, projectKey: !!PROJECT_KEY })
}

const extractDescription = (desc: any): string => {
  if (!desc) return ""
  if (typeof desc === "string") return desc
  if (Array.isArray(desc)) return desc.join(" ")
  if (desc.content) {
    const parts: string[] = []
    const walk = (nodes: any[]): void => {
      nodes.forEach((node: any) => {
        if (node.text) parts.push(node.text)
        if (node.content) walk(node.content)
      })
    }
    walk(desc.content)
    return parts.join(" ").trim()
  }
  return ""
}

// ============ API Routes ============
app.get("/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    jiraConfigured: isJiraConfigReady,
    apiPort: PORT
  })
})

// Debug endpoint to list registered routes
app.get('/debug/routes', (_req, res) => {
  try {
    const routes: string[] = [];
    // @ts-ignore
    app._router && app._router.stack.forEach((r: any) => {
      if (r.route && r.route.path) {
        const methods = Object.keys(r.route.methods).join(',').toUpperCase();
        routes.push({ path: r.route.path, methods });
      }
    });
    res.json({ routes });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// SPA Fallback: serve index.html for all non-API routes
// Waitlist endpoint: accepts { email } and writes to Supabase (server key) and/or forwards to a Google Sheets webhook
app.post('/api/waitlist', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // Insert into Supabase if SERVICE key present
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        const { error } = await sb.from('waitlist').insert({ email });
        if (error) console.error('[Waitlist] Supabase insert error:', error);
      } catch (err) {
        console.error('[Waitlist] Supabase error:', err);
      }
    }

    // Forward to a Google Sheets webhook if configured (e.g., Apps Script web app URL)
    const gsWebhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    if (gsWebhook) {
      try {
        await fetch(gsWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      } catch (err) {
        console.error('[Waitlist] Google Sheets webhook error:', err);
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Waitlist] Unexpected error:', err);
    return res.status(500).json({ error: 'internal' });
  }
});

// SPA fallback route - must be last
app.use((req: Request, res: Response) => {
  console.log('[Fallback] Caught request:', req.method, req.path, 'url:', req.url);
  if (req.url.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' })
    return
  }
  // Temporarily just return a simple response
  res.status(200).send('SPA fallback - would serve index.html')
});

// Start server after initializing Redis
;(async () => {
  try {
    await initializeRedis();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`API server listening on http://localhost:${PORT}`)
      console.log(`  - Jira API: ${isJiraConfigReady ? 'configured' : 'NOT configured'}`)
    })
  } catch (error) {
    console.error('[Server] Failed to start:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();

// The Express server keeps the event loop alive

// Handle uncaught exceptions (log but do not exit in dev)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  console.error('Stack:', err.stack)
  // In development, avoid exiting so the server remains available for debugging
})

// Handle unhandled promise rejections (log but do not exit in dev)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // In development, avoid exiting so the server remains available for debugging
})
