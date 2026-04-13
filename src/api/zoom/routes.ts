// src/api/zoom/routes.ts
// Zoom OAuth2 + webhook receiver + meeting transcription

import express, { Request, Response } from 'express';
import { verifySupabaseToken } from '../authMiddleware.js';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';

const router = express.Router();

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ZOOM_CLIENT_ID = () => process.env.ZOOM_CLIENT_ID || '';
const ZOOM_CLIENT_SECRET = () => process.env.ZOOM_CLIENT_SECRET || '';
const ZOOM_REDIRECT_URI = (req: Request) => {
  const isProd = process.env.NODE_ENV === 'production' ||
    req.hostname === 'joinvelocity.co' ||
    req.hostname === 'www.joinvelocity.co';
  return isProd
    ? 'https://www.joinvelocity.co/api/zoom/auth/callback'
    : 'http://localhost:4000/api/zoom/auth/callback';
};

// ── OAuth Connect ─────────────────────────────────────────────────────────────
router.get('/auth/connect', (req: Request, res: Response) => {
  const state = req.query.orgId || '';
  const authUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${ZOOM_CLIENT_ID()}&redirect_uri=${encodeURIComponent(ZOOM_REDIRECT_URI(req))}&state=${state}`;
  res.redirect(authUrl);
});

// ── OAuth Callback ────────────────────────────────────────────────────────────
router.get('/auth/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code: string; state: string };
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const credentials = Buffer.from(`${ZOOM_CLIENT_ID()}:${ZOOM_CLIENT_SECRET()}`).toString('base64');
    const tokenRes = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ZOOM_REDIRECT_URI(req),
      }).toString(),
    });

    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) throw new Error('Failed to get Zoom access token');

    // Get user info
    const userRes = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userRes.json() as any;

    const supabase = getSupabase();
    await supabase.from('zoom_connections').upsert({
      organization_id: state,
      user_id: state,
      email: userInfo.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + (tokens.expires_in * 1000),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

    const frontendUrl = process.env.NODE_ENV === 'production'
      ? 'https://www.joinvelocity.co'
      : 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?tab=integrations&connected=zoom`);
  } catch (err: any) {
    console.error('[Zoom] Callback error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/status', verifySupabaseToken, async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('zoom_connections')
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
  await supabase.from('zoom_connections').delete().eq('organization_id', res.locals.organizationId);
  res.json({ success: true });
});

// ── Webhook — receives Zoom meeting.recording.completed events ────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  // Verify Zoom webhook signature
  const webhookSecretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';
  
  // Handle Zoom URL validation challenge
  if (req.body?.event === 'endpoint.url_validation') {
    const hashForValidate = crypto
      .createHmac('sha256', webhookSecretToken)
      .update(req.body.payload.plainToken)
      .digest('hex');
    return res.json({
      plainToken: req.body.payload.plainToken,
      encryptedToken: hashForValidate,
    });
  }

  // Verify signature for actual events
  const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`;
  const signature = crypto.createHmac('sha256', webhookSecretToken).update(message).digest('hex');
  const expectedSignature = `v0=${signature}`;
  
  if (req.headers['x-zm-signature'] !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body?.event;
  
  if (event === 'recording.completed') {
    const payload = req.body.payload?.object;
    const hostEmail = payload?.host_email;
    
    // Find org by host email
    const supabase = getSupabase();
    const { data: conn } = await supabase
      .from('zoom_connections')
      .select('organization_id')
      .eq('email', hostEmail)
      .single();

    if (conn) {
      // Get transcript URL
      const transcriptFile = payload?.recording_files?.find(
        (f: any) => f.file_type === 'TRANSCRIPT'
      );
      
      if (transcriptFile?.download_url) {
        // Download transcript
        const transcriptRes = await fetch(transcriptFile.download_url);
        const transcript = await transcriptRes.text();
        
        // Store for processing
        await supabase.from('meeting_transcripts').insert({
          organization_id: conn.organization_id,
          meeting_id: payload?.uuid,
          platform: 'zoom',
          title: payload?.topic || 'Zoom Meeting',
          transcript,
          status: 'pending',
          meeting_date: payload?.start_time,
        });

        // Process immediately with Gemini
        await processTranscript(conn.organization_id, payload?.uuid, transcript, payload?.topic);
      }
    }
  }

  res.json({ success: true });
});

// ── Process transcript with Gemini ────────────────────────────────────────────
async function processTranscript(orgId: string, meetingId: string, transcript: string, title: string) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze this meeting transcript and extract:
1. A brief summary (2-3 sentences)
2. Action items as a JSON array with fields: title, assignee (name mentioned or null), priority (high/medium/low), due_date (if mentioned or null)
3. Key decisions made
4. Follow-up questions that should be asked

Meeting Title: ${title}
Transcript: ${transcript.slice(0, 8000)}

Return ONLY valid JSON:
{
  "summary": "...",
  "action_items": [{"title": "...", "assignee": null, "priority": "medium", "due_date": null}],
  "decisions": ["..."],
  "follow_up_questions": ["..."]
}`
            }]
          }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const supabase = getSupabase();
    
    // Update transcript record
    await supabase.from('meeting_transcripts')
      .update({
        summary: parsed.summary,
        action_items: parsed.action_items,
        status: 'processed',
      })
      .eq('organization_id', orgId)
      .eq('meeting_id', meetingId);

    // Create AI task suggestions from action items
    if (parsed.action_items?.length > 0) {
      const suggestions = parsed.action_items.map((item: any) => ({
        task_name: item.title,
        description: `From meeting: ${title}. ${item.due_date ? `Due: ${item.due_date}` : ''}`,
        confidence_score: 0.85,
        status: 'pending',
        source_meeting_id: meetingId,
      }));
      await supabase.from('ai_task_suggestions').insert(suggestions);
    }

    console.log(`[Zoom] Processed transcript for meeting: ${title}, ${parsed.action_items?.length} action items`);
  } catch (err: any) {
    console.error('[Zoom] Process transcript error:', err.message);
  }
}

export { processTranscript };
export default router;
