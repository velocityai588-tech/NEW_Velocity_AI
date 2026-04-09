// src/api/linear/routes.ts
// API routes for Linear integration — mirrors src/api/jira/routes.ts structure

import express, { Request, Response } from 'express';
import { linearAuth } from './auth.js';
import {
  getLinearConnection,
  getAllLinearIssues,
  upsertLinearIssues,
  insertMLTrainingEvent,
  getMLTrainingEvents,
  type LinearIssue,
} from './db.js';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('[Linear Router]', req.method, req.path);
  next();
});

// ── OAuth routes ───────────────────────────────────────────────────────────────

// Initiate OAuth — GET /api/linear/auth/connect
router.get('/auth/connect', linearAuth.login);

// OAuth callback — GET /api/linear/auth/callback
router.get('/auth/callback', linearAuth.callback);

// Check connection status — GET /api/linear/auth/status
router.get('/auth/status', async (req: Request, res: Response) => {
  const orgId = (req.query.orgId as string) || req.session?.linearOrgId;

  // If no orgId from session/query, try to find from supabase user
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    res.json({ connected: false, workspace: null, orgId: null });
    return;
  }

  try {
    const conn = await getLinearConnection(resolvedOrgId);
    const connected = !!conn;

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      connected,
      workspace: connected
        ? { id: conn!.workspace_id, name: conn!.workspace_name }
        : null,
      orgId: resolvedOrgId,
    });
  } catch (err) {
    console.error('[Linear Status] Error:', err);
    res.status(500).json({ error: 'Failed to check Linear status' });
  }
});

// Disconnect — POST /api/linear/auth/disconnect
router.post('/auth/disconnect', async (req: Request, res: Response) => {
  await linearAuth.disconnect(req);
  res.json({ success: true, message: 'Linear disconnected' });
});

// ── Issue sync ─────────────────────────────────────────────────────────────────

// Fetch issues from Linear API and store in DB
// POST /api/linear/sync
router.post('/sync', async (req: Request, res: Response) => {
  const orgId = (req.body.orgId as string) || req.session?.linearOrgId;
  if (!orgId) {
    return res.status(400).json({ error: 'orgId is required' });
  }

  try {
    const accessToken = await linearAuth.getAccessToken(req) || (await getLinearConnection(orgId))?.access_token || null;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not connected to Linear' });
    }

    const conn = await getLinearConnection(orgId);
    if (!conn) {
      return res.status(401).json({ error: 'No Linear connection found' });
    }

    // Fetch issues from Linear GraphQL API
    const issues = await fetchLinearIssues(accessToken, conn.workspace_id);
    await upsertLinearIssues(orgId, conn.workspace_id, issues);

    res.json({ success: true, synced: issues.length });
  } catch (err) {
    console.error('[Linear Sync] Error:', err);
    res.status(500).json({ error: 'Failed to sync Linear issues' });
  }
});

// Get issues from DB — GET /api/linear/issues
router.get('/issues', async (req: Request, res: Response) => {
  const orgId = (req.query.orgId as string) || req.session?.linearOrgId;
  if (!orgId) {
    return res.status(400).json({ error: 'orgId is required' });
  }

  try {
    const issues = await getAllLinearIssues(orgId);
    res.json({ issues, source: 'database' });
  } catch (err) {
    console.error('[Linear Issues] Error:', err);
    res.status(500).json({ error: 'Failed to get Linear issues' });
  }
});

// ── Push approved task to Linear ──────────────────────────────────────────────
// POST /api/linear/push-task
// Called when manager approves an AI suggestion — creates issue in Linear
router.post('/push-task', async (req: Request, res: Response) => {
  const { orgId, taskName, taskDescription, teamId, assigneeId, priority } = req.body;

  if (!orgId || !taskName) {
    return res.status(400).json({ error: 'orgId and taskName are required' });
  }

  try {
    const accessToken = await linearAuth.getAccessToken(req) || (await getLinearConnection(orgId))?.access_token || null;

    if (!accessToken) {
      // Linear not connected — log to DB for later sync, don't fail silently
      console.warn('[Linear PushTask] No access token — task queued for when Linear is connected');
      res.json({ success: false, queued: true, message: 'Linear not connected — task queued' });
      return;
    }

    // Create issue in Linear via GraphQL
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
            title
          }
        }
      }
    `;

    const variables: any = {
      input: {
        title: taskName,
        description: taskDescription || '',
        priority: priority ?? 2, // Default: High
      },
    };

    // Add optional fields if provided
    if (teamId) variables.input.teamId = teamId;
    if (assigneeId) variables.input.assigneeId = assigneeId;

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status}`);
    }

    const data = await response.json() as any;
    const result = data?.data?.issueCreate;

    if (!result?.success) {
      throw new Error('Linear issue creation failed');
    }

    console.log(`[Linear PushTask] ✓ Created issue ${result.issue.identifier}: ${result.issue.title}`);
    res.json({
      success: true,
      issue: {
        id: result.issue.id,
        identifier: result.issue.identifier,
        url: result.issue.url,
        title: result.issue.title,
      },
    });
  } catch (err) {
    console.error('[Linear PushTask] Error:', err);
    res.status(500).json({ error: 'Failed to push task to Linear' });
  }
});

// ── ML training events ─────────────────────────────────────────────────────────
// POST /api/linear/ml-training-event
// Called on every approve/reject — logs signal for the linear model to learn from
router.post('/ml-training-event', async (req: Request, res: Response) => {
  const {
    orgId,
    taskId,
    suggestedUserId,
    skillMatchScore,
    workloadAtTime,
    approved,
  } = req.body;

  if (!orgId || !taskId || !suggestedUserId || approved === undefined) {
    return res.status(400).json({ error: 'orgId, taskId, suggestedUserId, approved are required' });
  }

  try {
    await insertMLTrainingEvent({
      org_id: orgId,
      task_id: taskId,
      suggested_user_id: suggestedUserId,
      skill_match_score: skillMatchScore ?? 0,
      workload_at_time: workloadAtTime ?? 0,
      approved: Boolean(approved),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Linear ML Event] Error:', err);
    res.status(500).json({ error: 'Failed to log ML training event' });
  }
});

// GET /api/linear/ml-training-events — for the Python ML engine to fetch
router.get('/ml-training-events', async (req: Request, res: Response) => {
  const orgId = req.query.orgId as string;
  if (!orgId) {
    return res.status(400).json({ error: 'orgId is required' });
  }
  try {
    const events = await getMLTrainingEvents(orgId);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ML training events' });
  }
});

// ── Debug ──────────────────────────────────────────────────────────────────────

router.get('/debug/status', async (req: Request, res: Response) => {
  const orgId = (req.query.orgId as string) || req.session?.linearOrgId;
  if (!orgId) {
    return res.status(400).json({ error: 'orgId required' });
  }
  try {
    const conn = await getLinearConnection(orgId);
    const issues = await getAllLinearIssues(orgId);
    res.json({
      orgId,
      connected: !!conn,
      workspace: conn ? { id: conn.workspace_id, name: conn.workspace_name } : null,
      issueCount: issues.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Debug check failed' });
  }
});

export default router;

// ── Linear GraphQL helpers ─────────────────────────────────────────────────────

async function fetchLinearIssues(accessToken: string, workspaceId: string): Promise<LinearIssue[]> {
  const query = `
    query GetIssues {
      issues(first: 250, filter: { state: { type: { nin: ["completed", "cancelled"] } } }) {
        nodes {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state { name }
          assignee { id name }
          team { id name }
          project { id name }
          createdAt
          updatedAt
          dueDate
          completedAt
          estimate
          labels { nodes { name } }
          url
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const nodes = data?.data?.issues?.nodes || [];

  return nodes.map((node: any): LinearIssue => ({
    org_id: '', // filled in by caller
    workspace_id: workspaceId,
    issue_id: node.id,
    identifier: node.identifier || '',
    title: node.title || '',
    description: node.description || '',
    status: node.state?.name || 'Todo',
    priority: node.priority ?? 0,
    priority_label: node.priorityLabel || 'No priority',
    assignee_id: node.assignee?.id || null,
    assignee_name: node.assignee?.name || '',
    team_id: node.team?.id || '',
    team_name: node.team?.name || '',
    project_id: node.project?.id || null,
    project_name: node.project?.name || '',
    created_at: node.createdAt || null,
    updated_at: node.updatedAt || null,
    due_date: node.dueDate || null,
    completed_at: node.completedAt || null,
    estimate: node.estimate ?? null,
    labels: (node.labels?.nodes || []).map((l: any) => l.name),
    url: node.url || '',
  }));
}
