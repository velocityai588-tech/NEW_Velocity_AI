import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import jiraRoutes from '../src/api/jira/routes.js';
import leaveApprovalRoutes from '../src/api/leave-approval/routes.js';
import analyzeRoutes from '../src/api/analyze/routes.js';
import aiInsightsRoutes from '../src/api/analyze/ai-insights-routes.js';

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
app.use('/api/v1/analyze', analyzeRoutes);
app.use('/api/v1', aiInsightsRoutes);

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

// Export the Express app as the Vercel handler
export default app;
