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
import analyzeRoutes from "./src/api/analyze/routes.js"
import aiInsightsRoutes from "./src/api/analyze/ai-insights-routes.js"
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

// Session middleware for OAuth flows (Jira)
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



// ============ Jira OAuth & API Routes (multi-tenant) ============
app.use('/api/jira', jiraRoutes);
console.log('[Server] Jira OAuth routes mounted');

// ============ Deployed API Routes ============
app.use('/api/deployed', deployedRoutes);
console.log('[Server] Deployed routes mounted');

// ============ Leave Approval Agent Routes ============
app.use('/api/leave-approval', leaveApprovalRoutes);
console.log('[Server] Leave Approval Agent routes mounted');

// ============ Team Capacity Analysis Routes ============
app.use('/api/v1/analyze', analyzeRoutes);
console.log('[Server] Team Capacity Analysis routes mounted');

// ============ AI Insights Routes ============
app.use('/api/v1', aiInsightsRoutes);
console.log('[Server] AI Insights routes mounted');

// try {
//   const stack = (hubspotRoutes as any)?.stack || []
//   const routes = stack.map((layer: any) => {
//     if (layer.route) return `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`
//     return layer.name || 'middleware'
//   })
//   console.log('[Server] HubSpot router registered routes:', routes)
// } catch (e) {
//   console.log('[Server] Could not introspect hubspotRoutes stack', e)
// }

// Temporary direct test route to verify requests reach the server
// app.get('/api/hubspot/auth/status-test', (req: Request, res: Response) => {
//   console.log('[Direct Test] /api/hubspot/auth/status-test hit, sessionID:', req.sessionID)
//   res.json({ ok: true, test: 'direct' })
// })

// Also mount HubSpot router at /hubspot for debugging (non-API prefix)
// app.use('/hubspot', hubspotRoutes)
// console.log('[Server] Also mounted HubSpot routes at /hubspot for debugging')

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
