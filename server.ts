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
import { WebSocketServer, WebSocket } from "ws"
import http from "http"

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
import authRoutes from "./src/api/auth/routes.ts"
import leaveApprovalRoutes from "./src/api/leave-approval/routes.ts"
import invitesRoutes from "./src/api/invites/routes.ts"
import employeeRoutes from "./src/api/employee/routes.ts"
import organizationRoutes from "./src/api/organization/routes.ts"
import linearRoutes from "./src/api/linear/routes.ts"
import googleRoutes from "./src/api/google/routes.ts"
import zoomRoutes from "./src/api/zoom/routes.ts"
import teamsRoutes from "./src/api/teams/routes.ts"
import meetingsRoutes from "./src/api/meetings/routes.ts"
import zoomRoutes from "./src/api/zoom/routes.ts"
import teamsRoutes from "./src/api/teams/routes.ts"
import meetingsRoutes from "./src/api/meetings/routes.ts"
import zoomRoutes from "./src/api/zoom/routes.ts"
import teamsRoutes from "./src/api/teams/routes.ts"
import meetingsRoutes from "./src/api/meetings/routes.ts"
const app = express()

console.log("typeof express:", typeof express)
console.log("express keys:", Object.keys(express))

// Trust proxy for Vercel/Nginx - required for Secure cookies to work behind proxy
app.set('trust proxy', 1)

// Simple request logger to help debugging route matching
app.use((req: Request, res: Response, next) => {
  console.log(`[API DEBUG] ${req.method} ${req.url}`);
  console.log('  - Headers:', { 
    host: req.headers.host, 
    origin: req.headers.origin,
    auth: req.headers.authorization ? 'Present' : 'Missing'
  });
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

// ============ Supabase DB Test ============
async function testSupabaseConnection() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[DB] Missing SUPABASE_URL or SUPABASE_ANON_KEY - DB persistence disabled');
    return;
  }
  try {
    const client = createClient(supabaseUrl, supabaseKey);
    // Test with a simple count query to verify connection
    const { count, error } = await client.from('organizations').select('*', { count: 'exact', head: true });
    if (error) {
      console.error('[DB] Supabase connection test FAILED:', error.message, error.details);
    } else {
      console.log('[DB] ✓ Supabase connected. Organizations count:', count);
    }
  } catch (e) {
    console.error('[DB] Supabase connection error:', e);
  }
}
testSupabaseConnection();

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
app.use('/api/google', googleRoutes);
app.use('/api/zoom', zoomRoutes);
console.log('[Server] Zoom routes mounted');
app.use('/api/teams', teamsRoutes);
console.log('[Server] Teams routes mounted');
app.use('/api/meetings', meetingsRoutes);
console.log('[Server] Meetings routes mounted');
app.use('/api/zoom', zoomRoutes);
console.log('[Server] Zoom routes mounted');
app.use('/api/teams', teamsRoutes);
console.log('[Server] Teams routes mounted');
app.use('/api/meetings', meetingsRoutes);
console.log('[Server] Meetings routes mounted');
app.use('/api/zoom', zoomRoutes);
console.log('[Server] Zoom routes mounted');
app.use('/api/teams', teamsRoutes);
console.log('[Server] Teams routes mounted');
app.use('/api/meetings', meetingsRoutes);
console.log('[Server] Meetings routes mounted');
console.log('[Server] Google routes mounted');
app.use('/api/jira', jiraRoutes);
console.log('[Server] Jira OAuth routes mounted');

// ============ Auth Routes ============
app.use('/api/auth', authRoutes);
console.log('[Server] Auth routes mounted');

// ============ Deployed API Routes ============
app.use('/api/deployed', deployedRoutes);
console.log('[Server] Deployed routes mounted');

// ============ Employee API Routes ============
app.use('/api/employee', employeeRoutes);
console.log('[Server] Employee routes mounted');

// ============ Leave Approval Agent Routes ============
app.use('/api/leave-approval', leaveApprovalRoutes);
console.log('[Server] Leave Approval Agent routes mounted');

// ============ Invites Routes ============
app.use('/api/invites', invitesRoutes);
console.log('[Server] Invites routes mounted');

// ============ Employee Routes ============
app.use('/api/employee', employeeRoutes);
console.log('[Server] Employee routes mounted');

// ============ Organization Routes ============
app.use('/api/organization', organizationRoutes);

app.use('/api/linear', linearRoutes);
console.log('[Server] Organization routes mounted at /api/organization');

// AI Description Expander
app.post('/api/ai/expand-description', async (req: Request, res: Response) => {
  const { title, description } = req.body;
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
  const prompt = description?.trim()
    ? 'Expand this project description for an engineering team. 3-4 sentences. Original: ' + description
    : 'Write a detailed project description for: ' + title + '. Include goals, features, and success criteria. 3-4 sentences.';
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'system', content: 'You are a senior PM. Write clear project descriptions. Return only the description.' }, { role: 'user', content: prompt }], max_tokens: 250, temperature: 0.7 })
    }) as any;
    if (groqRes.ok) {
      const data = await groqRes.json() as any;
      const expanded = data.choices?.[0]?.message?.content?.trim();
      if (expanded) return res.json({ description: expanded });
    }
    res.status(500).json({ error: 'Failed' });
  } catch(e) { res.status(500).json({ error: String(e) }); }
});
console.log('[Server] AI expand-description mounted');

app.get('/api/debug-routes', (req, res) => {
  res.json({
    mounted: [
      '/api/jira',
      '/api/deployed',
      '/api/leave-approval',
      '/api/invites',
      '/api/employee',
      '/api/organization'
    ]
  });
});

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
    
    const server = http.createServer(app);
    
    // ============ Gemini Multimodal Live WebSocket Proxy ============
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

      if (pathname === '/api/voice-live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    wss.on('connection', (ws: WebSocket) => {
      console.log('[VoiceProxy] Client connected');
      const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error('[VoiceProxy] GEMINI_API_KEY is missing');
        ws.close(1011, 'API Key missing');
        return;
      }

      const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      console.log(`[VoiceProxy] Connecting to Gemini: ${geminiUrl.slice(0, 45)}...`);
      const geminiSocket = new WebSocket(geminiUrl);

      geminiSocket.on('open', () => {
        console.log('[VoiceProxy] Connected to Gemini Multimodal Live');
      });

      geminiSocket.on('message', (data) => {
        console.log('[VoiceProxy] Message from Gemini:', data.toString());
        // Relay from Gemini to Client
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      ws.on('message', (data) => {
        // Relay from Client to Gemini
        if (geminiSocket.readyState === WebSocket.OPEN) {
          geminiSocket.send(data);
        }
      });

      const cleanup = (code?: number, reason?: string) => {
        console.log(`[VoiceProxy] Connection closed. Code: ${code}, Reason: ${reason}`);
        if (geminiSocket.readyState === WebSocket.OPEN) geminiSocket.close();
        if (ws.readyState === WebSocket.OPEN) ws.close();
      };

      ws.on('close', (code, reason) => cleanup(code, reason?.toString() || "No reason"));
      geminiSocket.on('close', (code, reason) => cleanup(code, reason?.toString() || "No reason"));
      ws.on('error', (err) => console.error('[VoiceProxy] Client error:', err));
      geminiSocket.on('error', (err) => console.error('[VoiceProxy] Gemini error:', err));
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`API server listening on http://localhost:${PORT}`)
      console.log(`  - Jira API: ${isJiraConfigReady ? 'configured' : 'NOT configured'}`)
      console.log(`  - Voice Proxy: ws://localhost:${PORT}/api/voice-live`)
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
