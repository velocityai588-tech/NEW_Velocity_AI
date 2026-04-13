// src/api/google/routes.ts
// Express routes for Google/Gmail integration.

import express from 'express';
import { verifySupabaseToken } from '../authMiddleware.js';
import * as auth from './auth.js';
import { syncGmail } from './gmailSync.js';
import * as db from './db.js';

const router = express.Router();

// 1. OAuth Flow (Initiation doesn't need token if redirected from frontend with state)
router.get('/auth/connect', auth.login);
router.get('/auth/callback', auth.callback);

// 2. Protected Routes (Require Supabase JWT)
router.use(verifySupabaseToken);

router.post('/auth/disconnect', auth.disconnect);

router.post('/sync', async (_req, res) => {
  try {
    const orgId = res.locals.organizationId;
    const result = await syncGmail(orgId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending-actions', async (_req, res) => {
  try {
    const orgId = res.locals.organizationId;
    const actions = await db.getPendingActions(orgId);
    res.json({ actions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/actions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await db.updateActionStatus(id, status);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
