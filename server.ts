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
import http from "http"

// REDIS REMOVED AS PER USER REQUEST - USING STATELESS SERVERLESS PATTERN

// Static imports
import jiraRoutes from "./src/api/jira/routes.js"
import deployedRoutes from "./src/api/deployed/routes.js"
import authRoutes from "./src/api/auth/routes.ts"
import leaveApprovalRoutes from "./src/api/leave-approval/routes.ts"
import invitesRoutes from "./src/api/invites/routes.ts"
import employeeRoutes from "./src/api/employee/routes.ts"
import organizationRoutes from "./src/api/organization/routes.ts"
import linearRoutes from "./src/api/linear/routes.ts"
import voiceRoutes from "./src/api/voice/routes.ts"
import googleRoutes from "./src/api/google/routes.ts"

export const app = express()

// Trust proxy for Vercel/Nginx - required for Secure cookies to work behind proxy
app.set('trust proxy', 1)

// Simple request logger to help debugging route matching
app.use((req: Request, res: Response, next) => {
  console.log(`[API DEBUG] ${req.method} ${req.url}`);
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

// Session middleware - Modified to use memory store for serverless compatibility
// NOTE: For true production serverless, sessions should be handled via JWT/Supabase
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: true,
  saveUninitialized: true,
  name: 'velocity-sid',
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === 'production' ? '.joinvelocity.co' : undefined
  }
}))

const PORT = Number(process.env.API_PORT || 4000)

// ============ API Routes ============
app.get("/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(), 
    apiPort: PORT,
    mode: process.env.VERCEL ? 'serverless' : 'standalone'
  })
})

app.use('/api/jira', jiraRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/deployed', deployedRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/leave-approval', leaveApprovalRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/linear', linearRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/google', googleRoutes);

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
      const rawText = data.choices?.[0]?.message?.content?.trim() || '';
      
      const expanded = rawText
        .replace(/^(Draft \d+|Final Answer|Response|Answer|User Query|Role|Question|Data|Prompt|Senior PM):?\s*/gi, '')
        .replace(/[*#_~`\[\]()|>]/g, '')
        .trim();
        
      if (expanded) return res.json({ description: expanded });
    }
    res.status(500).json({ error: 'Failed' });
  } catch(e) { res.status(500).json({ error: String(e) }); }
});

app.post('/api/waitlist', async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email || !/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseServiceKey) {
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      await sb.from('waitlist').insert({ email });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal' });
  }
});

// SPA fallback route - must be last
app.use((req: Request, res: Response) => {
  if (req.url.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' })
    return
  }
  // In serverless mode, we don't serve static files from express
  res.status(200).send('API Entry Point')
});

export default app;

// Decorator: Only start listener if not in serverless environment OR Vite middleware mode
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.VITE) {
  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Standalone] API server listening on http://localhost:${PORT}`)
  })
}

process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); })
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); })
