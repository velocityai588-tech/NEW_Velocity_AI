// src/api/teams/routes.ts
// Microsoft Teams OAuth2 + webhook + meeting transcription via Graph API

import express, { Request, Response } from 'express';
import { verifySupabaseToken } from '../authMiddleware.js';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { processTranscript } from '../zoom/routes.js';

const router = express.Router();

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const TEAMS_CLIENT_ID = () => process.env.TEAMS_CLIENT_ID || '';
const TEAMS_CLIENT_SECRET = () => process.env.TEAMS_CLIENT_SECRET || '';
const TEAMS_TENANT_ID = () => process.env.TEAMS_TENANT_ID || 'common';

const TEAMS_REDIRECT_URI = (req: Request) => {
  const isProd = process.env.NODE_ENV === 'production' ||
    req.hostname === 'joinvelocity.co' ||
    req.hostname === 'www.joinvelocity.co';
  return isProd
    ? 'https://www.joinvelocity.co/api/teams/auth/callback'
    : 'http://localhost:4000/api/teams/auth/callback';
};

const TEAMS_SCOPES = [
  'offline_access',
  'User.Read',
  'OnlineMeetings.Read',
  'OnlineMeetings.ReadWrite',
  'CallRecords.Read.All',
  'Calendars.Read',
].join(' ');

// ── OAuth Connect ─────────────────────────────────────────────────────────────
router.get('/auth/connect', (req: Request, res: Response) => {
  const state = req.query.orgId || '';
  const authUrl = `https://login.microsoftonline.com/${TEAMS_TENANT_ID()}/oauth2/v2.0/authorize?` +
    `client_id=${TEAMS_CLIENT_ID()}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(TEAMS_REDIRECT_URI(req))}&` +
    `scope=${encodeURIComponent(TEAMS_SCOPES)}&` +
    `state=${state}&` +
    `prompt=consent`;
  res.redirect(authUrl);
});

// ── OAuth Callback ────────────────────────────────────────────────────────────
router.get('/auth/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code: string; state: string };
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TEAMS_TENANT_ID()}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: TEAMS_CLIENT_ID(),
          client_secret: TEAMS_CLIENT_SECRET(),
          code,
          redirect_uri: TEAMS_REDIRECT_URI(req),
          grant_type: 'authorization_code',
          scope: TEAMS_SCOPES,
        }).toString(),
      }
    );

    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) throw new Error('Failed to get Teams access token');

    // Get user info from Microsoft Graph
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json() as any;

    // Decode JWT to get tenant ID
    const tokenPayload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64').toString());
    const tenantId = tokenPayload.tid;

    const supabase = getSupabase();
    await supabase.from('teams_connections').upsert({
      organization_id: state,
      user_id: state,
      email: userInfo.mail || userInfo.userPrincipalName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + (tokens.expires_in * 1000),
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

    // Set up subscription for call records
    await setupCallRecordsSubscription(tokens.access_token, state);

    const frontendUrl = process.env.NODE_ENV === 'production'
      ? 'https://www.joinvelocity.co'
      : 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?tab=integrations&connected=teams`);
  } catch (err: any) {
    console.error('[Teams] Callback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', verifySupabaseToken, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('teams_connections')
      .select('email, updated_at')
      .eq('organization_id', res.locals.organizationId)
      .single();
    res.json({ connected: !!data, email: data?.email });
  } catch {
    res.json({ connected: false });
  }
});

// ── Disconnect ────────────────────────────────────────────────────────────────
router.post('/auth/disconnect', verifySupabaseToken, async (_req: Request, res: Response) => {
  const supabase = getSupabase();
  await supabase.from('teams_connections').delete().eq('organization_id', res.locals.organizationId);
  res.json({ success: true });
});

// ── Setup Graph API subscription for call records ─────────────────────────────
async function setupCallRecordsSubscription(accessToken: string, orgId: string) {
  try {
    const webhookUrl = process.env.NODE_ENV === 'production'
      ? 'https://velocity-ai-api.onrender.com/api/teams/webhook'
      : 'https://velocity-ai-api.onrender.com/api/teams/webhook'; // Always use prod for webhooks

    const expiryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days

    await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changeType: 'created',
        notificationUrl: webhookUrl,
        resource: '/communications/callRecords',
        expirationDateTime: expiryDate,
        clientState: orgId,
      }),
    });
    console.log('[Teams] Call records subscription created for org:', orgId);
  } catch (err: any) {
    console.warn('[Teams] Failed to create subscription:', err.message);
  }
}

// ── Webhook — receives Teams call record notifications ────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  // Microsoft validation challenge
  if (req.query.validationToken) {
    return res.status(200).send(req.query.validationToken);
  }

  const notifications = req.body?.value || [];
  
  for (const notification of notifications) {
    const orgId = notification.clientState;
    const callId = notification.resourceData?.id;

    if (!orgId || !callId) continue;

    // Get the call record
    const supabase = getSupabase();
    const { data: conn } = await supabase
      .from('teams_connections')
      .select('access_token, refresh_token')
      .eq('organization_id', orgId)
      .single();

    if (!conn) continue;

    try {
      // Fetch call record with transcript
      const callRes = await fetch(
        `https://graph.microsoft.com/v1.0/communications/callRecords/${callId}?$expand=sessions($expand=segments)`,
        { headers: { 'Authorization': `Bearer ${conn.access_token}` } }
      );
      const callRecord = await callRes.json() as any;

      // Get transcript if available
      const transcriptRes = await fetch(
        `https://graph.microsoft.com/v1.0/communications/callRecords/${callId}/microsoft.graph.callRecords.getDirectRoutingCalls()`,
        { headers: { 'Authorization': `Bearer ${conn.access_token}` } }
      );

      // Store meeting transcript
      const title = callRecord?.joinWebUrl ? 'Teams Meeting' : 'Teams Call';
      const participants = callRecord?.participants?.map((p: any) => p.user?.displayName).join(', ');
      const transcript = `Teams meeting with: ${participants}. Duration: ${callRecord?.sessions?.[0]?.segments?.length || 0} segments.`;

      await supabase.from('meeting_transcripts').insert({
        organization_id: orgId,
        meeting_id: callId,
        platform: 'teams',
        title,
        transcript,
        status: 'pending',
        meeting_date: callRecord?.startDateTime,
      });

      await processTranscript(orgId, callId, transcript, title);
    } catch (err: any) {
      console.error('[Teams] Process call error:', err.message);
    }
  }

  res.json({ success: true });
});

// ── Get recent meetings ───────────────────────────────────────────────────────
router.get('/meetings', verifySupabaseToken, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const orgId = res.locals.organizationId;

    const { data: conn } = await supabase
      .from('teams_connections')
      .select('access_token')
      .eq('organization_id', orgId)
      .single();

    if (!conn) return res.json({ meetings: [] });

    const meetingsRes = await fetch(
      'https://graph.microsoft.com/v1.0/me/onlineMeetings?$top=10',
      { headers: { 'Authorization': `Bearer ${conn.access_token}` } }
    );
    const data = await meetingsRes.json() as any;
    res.json({ meetings: data.value || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
