// src/api/meetings/routes.ts
// Unified meeting transcripts, action items, and AI suggestions

import express, { Request, Response } from 'express';
import { verifySupabaseToken } from '../authMiddleware.js';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const router = express.Router();

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// All routes require auth
router.use(verifySupabaseToken);

// ── Get all meeting transcripts ───────────────────────────────────────────────
router.get('/transcripts', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('meeting_transcripts')
      .select('id, platform, title, summary, action_items, meeting_date, status, created_at')
      .eq('organization_id', res.locals.organizationId)
      .order('meeting_date', { ascending: false })
      .limit(20);
    res.json({ transcripts: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get single transcript with full details ───────────────────────────────────
router.get('/transcripts/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('meeting_transcripts')
      .select('*')
      .eq('id', req.params.id)
      .eq('organization_id', res.locals.organizationId)
      .single();
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Approve action item → create task ────────────────────────────────────────
router.post('/transcripts/:id/approve-action', async (req: Request, res: Response) => {
  try {
    const { actionIndex, projectId, assigneeId } = req.body;
    const supabase = getSupabase();
    const orgId = res.locals.organizationId;

    const { data: transcript } = await supabase
      .from('meeting_transcripts')
      .select('action_items, title')
      .eq('id', req.params.id)
      .single();

    if (!transcript) return res.status(404).json({ error: 'Not found' });

    const actionItem = transcript.action_items?.[actionIndex];
    if (!actionItem) return res.status(400).json({ error: 'Action item not found' });

    // Create task
    await supabase.from('tasks').insert({
      name: actionItem.title,
      description: `From meeting: ${transcript.title}`,
      project_id: projectId || null,
      assignee_id: assigneeId || null,
      status: 'not_started',
      created_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Real-time AI meeting assistant ────────────────────────────────────────────
// Takes partial transcript + context, returns suggestions
router.post('/ai-assist', async (req: Request, res: Response) => {
  try {
    const { transcript, meetingTitle, currentSpeaker } = req.body;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'AI not configured' });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a real-time meeting assistant. Based on this partial meeting transcript, provide:
1. 3 follow-up questions the current speaker should ask
2. 2 key points to bring up next
3. Any action items already mentioned that should be captured

Meeting: ${meetingTitle}
Current speaker: ${currentSpeaker || 'Unknown'}
Transcript so far: ${transcript?.slice(-3000)}

Return ONLY valid JSON:
{
  "follow_up_questions": ["...", "...", "..."],
  "points_to_raise": ["...", "..."],
  "action_items_detected": ["..."],
  "suggested_response": "One sentence suggestion for what to say next"
}`
            }]
          }],
          generationConfig: { temperature: 0.3 }
        })
      }
    );

    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(clean);
    res.json(suggestions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get meeting stats ─────────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const orgId = res.locals.organizationId;

    const { data } = await supabase
      .from('meeting_transcripts')
      .select('platform, status, action_items')
      .eq('organization_id', orgId);

    const stats = {
      total_meetings: data?.length || 0,
      by_platform: {
        zoom: data?.filter(d => d.platform === 'zoom').length || 0,
        teams: data?.filter(d => d.platform === 'teams').length || 0,
        meet: data?.filter(d => d.platform === 'meet').length || 0,
      },
      total_action_items: data?.reduce((sum, d) => sum + (d.action_items?.length || 0), 0) || 0,
      processed: data?.filter(d => d.status === 'processed').length || 0,
    };

    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
