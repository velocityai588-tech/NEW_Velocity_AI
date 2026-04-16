// src/api/google/calendarRoutes.ts
// Google Calendar OAuth + sync routes

import express, { Request, Response } from 'express';
import { verifySupabaseToken } from '../authMiddleware.js';
import { google } from 'googleapis';
import * as db from './db.js';
import { syncGoogleCalendar, getUpcomingEvents, createCalendarEvent } from './calendarSync.js';

const router = express.Router();

const getClientId = () => process.env.GOOGLE_CLIENT_ID || '';
const getClientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';

const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const getRedirectUri = (_req: Request) => {
  const isProd = process.env.NODE_ENV === 'production';
  return isProd
    ? 'https://www.joinvelocity.co/api/calendar/auth/callback'
    : 'http://localhost:4000/api/calendar/auth/callback';
};

// ── OAuth Connect ─────────────────────────────────────────────────────────────
router.get('/auth/connect', (req: Request, res: Response) => {
  const oauth2Client = new google.auth.OAuth2(getClientId(), getClientSecret(), getRedirectUri(req));
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: CALENDAR_SCOPES,
    prompt: 'consent',
    state: req.query.userId as string || '',
  });
  res.redirect(authUrl);
});

// ── OAuth Callback ────────────────────────────────────────────────────────────
router.get('/auth/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code: string; state: string };
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const oauth2Client = new google.auth.OAuth2(getClientId(), getClientSecret(), getRedirectUri(req));
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    if (!email) throw new Error('Could not get email from Google');

    // Find org by user ID from state
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', state)
      .single();

    if (!userData?.organization_id) throw new Error('Could not find organization');

    // Store/update connection with calendar scopes
    await db.upsertGoogleConnection({
      organization_id: userData.organization_id,
      user_id: state,
      email,
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
    });

    // Immediately sync calendar
    await syncGoogleCalendar(userData.organization_id);

    const frontendUrl = process.env.NODE_ENV === 'production'
      ? 'https://www.joinvelocity.co'
      : 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?tab=integrations&connected=calendar`);
  } catch (err: any) {
    console.error('[Calendar] Callback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', verifySupabaseToken, async (_req: Request, res: Response) => {
  try {
    const conn = await db.getGoogleConnection(res.locals.organizationId);
    res.json({ connected: !!conn, email: conn?.email });
  } catch {
    res.json({ connected: false });
  }
});

// ── Disconnect ────────────────────────────────────────────────────────────────
router.post('/auth/disconnect', verifySupabaseToken, async (_req: Request, res: Response) => {
  await db.deleteGoogleConnection(res.locals.organizationId);
  res.json({ success: true });
});

// ── Sync calendar events ──────────────────────────────────────────────────────
router.post('/sync', verifySupabaseToken, async (_req: Request, res: Response) => {
  try {
    const result = await syncGoogleCalendar(res.locals.organizationId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get upcoming events ───────────────────────────────────────────────────────
router.get('/events', verifySupabaseToken, async (_req: Request, res: Response) => {
  try {
    const events = await getUpcomingEvents(res.locals.organizationId);
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create calendar event ─────────────────────────────────────────────────────
router.post('/events', verifySupabaseToken, async (req: Request, res: Response) => {
  try {
    const event = await createCalendarEvent(res.locals.organizationId, req.body);
    res.json({ success: true, event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
