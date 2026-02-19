import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import jiraRoutes from '../src/api/jira/routes.js';
import leaveApprovalRoutes from '../src/api/leave-approval/routes.js';

// Create a fresh Express app instance for this serverless function
const app = express();

// Trust proxy for Vercel
app.set('trust proxy', 1);

// CORS configuration
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.FRONTEND_URL_PROD || 'https://www.joinvelocity.co')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Session middleware for OAuth
const sessionConfig: any = {
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
};

app.use(session(sessionConfig));

// Middleware to handle Vercel rewrites - preserve original path
app.use((req: Request, res: Response, next: NextFunction) => {
  // Vercel passes original path in _path query parameter when using rewrites
  const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const vercelPath = urlParams.get('_path');
  
  if (vercelPath) {
    // Update the request URL to use the original path
    req.url = vercelPath + (req.url.split('?')[1] ? '?' + req.url.split('?')[1] : '');
    console.log('[API] Vercel rewrite detected, original URL:', vercelPath);
  }
  
  console.log('[API] Request:', req.method, req.url);
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Velocity AI API is running',
    timestamp: new Date().toISOString(),
  });
});

// Mount API routers with /api prefix to match the expected routes
app.use('/api/jira', jiraRoutes);
app.use('/api/leave-approval', leaveApprovalRoutes);

// Team capacity calculator (stateless, does not affect ML)
const handleCapacity = (req: Request, res: Response) => {
  console.log('[Capacity API] Hit capacity endpoint, path:', req.path);
  console.log('[Capacity API] Body sample keys:', req.body && typeof req.body === 'object' ? Object.keys(req.body) : typeof req.body);
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
    console.error('[Capacity API] Error computing capacity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Primary path
app.post('/api/v1/analyze/capacity', handleCapacity);
// Alternate paths (handle Vercel rewrite variants)
app.post('/v1/analyze/capacity', handleCapacity);
app.post('/analyze/capacity', handleCapacity);

// Also mount at root level for backwards compatibility
app.use('/jira', jiraRoutes);
app.use('/leave-approval', leaveApprovalRoutes);

// Fallback 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method,
  });
});

console.log('[API Handler] Express app configured for Vercel');
// Dump registered routes for debugging
try {
  const routes: string[] = [];
  // @ts-ignore
  app._router && app._router.stack.forEach((r: any) => {
    if (r.route && r.route.path) {
      const methods = Object.keys(r.route.methods).join(',').toUpperCase();
      routes.push(`${methods} ${r.route.path}`);
    }
  });
  console.log('[API Handler] Registered routes:', routes);
} catch (e) {
  console.warn('[API Handler] Could not list routes', e);
}

// Export the Express app as the Vercel handler
export default app;
