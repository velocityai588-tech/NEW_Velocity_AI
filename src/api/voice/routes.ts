import express from 'express';
import type { Request, Response } from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const SYSTEM_PROMPT = (currentPath: string, currentProjectId?: string) => `
You are the voice assistant for Velocity AI — a workforce intelligence platform for engineering teams.
You help managers plan projects, allocate team members, check capacity, and navigate the app by voice.

## PRODUCT KNOWLEDGE
Velocity AI helps engineering managers:
- Plan projects using AI: describe a project and AI breaks it into tasks with hour estimates
- Allocate team members based on skills, capacity, and availability
- Track leave requests and team capacity in real time
- Monitor project health, timelines, and task completion
- Sync with Jira and Google Workspace

Current page: ${currentPath}${currentProjectId ? `
Active project ID: ${currentProjectId} — if user says "this project" or "assign this", use this ID.` : ''}

## ACTION TYPES
1. navigate: { target: "/dashboard"|"/projects"|"/people"|"/plan"|"/leave"|"/settings" }
2. create_project: { projectTitle, projectDescription, autoAnalyze: true }
3. add_team_member: { name, email, role }
4. create_task: { taskName }
5. delete_team_member: { name }
6. search: { query }
7. info: Answer product questions. { response: "1-2 sentence answer" }
8. gantt_query: Timeline questions. { query }
9. resource_query: Capacity/workload questions. { query }
10. approve_leave: Approve leave by name. { name }
11. project_report: Generate health report for a project. { projectId, projectName }
11. update_task: Update task status. { taskName, status: "completed"|"in_progress", hours: number }
12. sprint_plan: Plan next sprint using team capacity. No params needed.
12. unknown: { prompt: "clarifying question" }

## RULES
- NEVER say "standard mode" or any mode preamble in response field.
- For delete_team_member: always set requiresConfirmation: true.
- For create_project: set autoAnalyze: true if description provided.
- response is spoken aloud — keep it natural and brief.
- Respond ONLY with valid JSON, no markdown backticks.

{"type":"...","target":"","params":{"projectTitle":"","projectDescription":"","autoAnalyze":true,"name":"","email":"","role":"","taskName":"","query":""},"response":"","requiresConfirmation":false,"prompt":""}`;

// ── Local rule-based fallback — zero API calls ───────────────────────────────
function localParse(transcript: string, currentProjectId?: string): object {
  const text = transcript.toLowerCase().trim();

  // Navigation
  const navMap: Record<string, string> = {
    'dashboard': '/dashboard',
    'projects': '/projects', 'project': '/projects',
    'people': '/people', 'team': '/people',
    'plan': '/plan',
    'leave': '/leave',
    'settings': '/settings', 'setting': '/settings',
  };
  const isNav = text.includes('go') || text.includes('open') || text.includes('show') || text.includes('navigate') || text.includes('take me');
  for (const [key, path] of Object.entries(navMap)) {
    if (text.includes(key) && isNav) {
      return { type: 'navigate', target: path, response: `Opening ${key}.`, provider: 'local' };
    }
  }

  // Add team member
  const isAdd = text.includes('add') || text.includes('invite') || text.includes('onboard') || text.includes('bring');
  const hasRoleOrMember = ['developer', 'designer', 'engineer', 'manager', 'frontend', 'backend', 'fullstack', 'qa', 'member', 'team'].some(w => text.includes(w));
  if (isAdd && hasRoleOrMember) {
    const roleMap: Record<string, string> = {
      'frontend': 'Frontend Developer', 'front end': 'Frontend Developer',
      'backend': 'Backend Developer', 'back end': 'Backend Developer',
      'fullstack': 'Full Stack Developer', 'full stack': 'Full Stack Developer',
      'designer': 'Designer', 'ux': 'Designer', 'ui': 'Designer',
      'product manager': 'Product Manager', 'manager': 'Product Manager',
      'qa': 'QA Engineer', 'tester': 'QA Engineer',
      'engineer': 'Engineer', 'developer': 'Developer', 'dev': 'Developer',
    };
    let role = 'Team Member';
    const sortedRoles = Object.keys(roleMap).sort((a, b) => b.length - a.length);
    for (const r of sortedRoles) {
      if (text.includes(r)) { role = roleMap[r]; break; }
    }
    const noise = new Set(['add', 'invite', 'onboard', 'bring', 'new', 'team', 'member', 'as', 'a', 'an', 'the', 'please', 'frontend', 'backend', 'fullstack', 'designer', 'manager', 'engineer', 'developer', 'dev', 'qa', 'full', 'stack', 'front', 'back', 'end', 'ux', 'ui', 'tester', 'product']);
    const email = text.split(/\s+/).find(w => w.includes('@')) || '';
    const words = text.split(/\s+/).filter(w => !noise.has(w) && w.length > 1 && !w.includes('@'));
    const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'New Member';
    return { type: 'add_team_member', params: { name, email, role }, response: `Adding ${name} as ${role}.`, provider: 'local' };
  }

  // Remove team member
  const isRemove = text.includes('remove') || text.includes('delete') || text.includes('fire');
  if (isRemove) {
    const noise = new Set(['remove', 'delete', 'fire', 'from', 'the', 'team', 'member', 'please']);
    const words = text.split(/\s+/).filter(w => !noise.has(w) && w.length > 1);
    const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'team member';
    return { type: 'delete_team_member', params: { name }, response: `Removing ${name} from the team.`, requiresConfirmation: true, provider: 'local' };
  }

  // Create project
  const isCreate = text.includes('create project') || text.includes('new project') || text.includes('add project') || text.includes('plan project') || text.includes('plan a');
  if (isCreate) {
    return { type: 'create_project', params: { projectDescription: transcript, autoAnalyze: true }, response: 'Opening the project planner.', provider: 'local' };
  }

  // Capacity/resource query
  if (text.includes('bandwidth') || text.includes('capacity') || text.includes('available') || text.includes('who has') || text.includes('who is')) {
    return { type: 'resource_query', params: { query: transcript }, response: 'Checking team capacity.', provider: 'local' };
  }

  // Project health report
  if ((text.includes('report') || text.includes('health') || text.includes('status')) && (text.includes('project') || currentProjectId)) {
    const nameMatch = transcript.match(/(?:report|health|status)(?:\s+(?:for|on|of))?\s+(?:the\s+)?([^?]+?)(?:\?|$)/i);
    const projectName = nameMatch ? nameMatch[1].trim() : 'this project';
    return { type: 'project_report', params: { projectId: currentProjectId, projectName }, response: `Generating health report for ${projectName}.`, provider: 'local' };
  }

  // Sprint planning
  if ((text.includes('sprint') || text.includes('plan next') || text.includes('next sprint')) && (text.includes('plan') || text.includes('sprint'))) {
    return { type: 'sprint_plan', params: {}, response: 'Opening sprint planner with your team capacity data.', provider: 'local' };
  }

  // Update task status — "I finished X, took Y hours"
  const isTaskUpdate = text.includes('finished') || text.includes('completed') || text.includes('done with') || text.includes('took') || text.includes('spent');
  const hasTaskContext = text.includes('task') || text.includes('module') || text.includes('feature') || text.includes('ticket') || text.includes('issue') || text.split(/\s+/).length > 3;
  if (isTaskUpdate && hasTaskContext) {
    // Extract hours
    const hoursMatch = text.match(/(\d+)\s*(?:hours?|hrs?)/);
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : null;
    // Extract task name — everything after "finished/completed" before "took/spent"
    const taskMatch = transcript.match(/(?:finished|completed|done with)\s+(?:the\s+)?([^,\.]+?)(?:\s+(?:took|spent|,|\.|$))/i);
    const taskName = taskMatch ? taskMatch[1].trim() : transcript;
    return res.json({ type: 'update_task', params: { taskName, status: 'completed', hours }, response: hours ? `Got it, marking as done and logging ${hours} hours.` : 'Marking that as completed.', provider: 'local' });
  }

  // Project health report
  if ((text.includes('report') || text.includes('health') || text.includes('status')) && (text.includes('project') || currentProjectId)) {
    const nameMatch = transcript.match(/(?:report|health|status)(?:\s+(?:for|on|of))?\s+(?:the\s+)?([^?]+?)(?:\?|$)/i);
    const projectName = nameMatch ? nameMatch[1].trim() : 'this project';
    return { type: 'project_report', params: { projectId: currentProjectId, projectName }, response: `Generating health report for ${projectName}.`, provider: 'local' };
  }

  // Sprint planning
  if ((text.includes('sprint') || text.includes('plan next') || text.includes('next sprint')) && (text.includes('plan') || text.includes('sprint'))) {
    return { type: 'sprint_plan', params: {}, response: 'Opening sprint planner with your team capacity data.', provider: 'local' };
  }

  // Update task status — "I finished the auth module, took 6 hours"
  if (text.includes('finished') || text.includes('completed') || text.includes('done with') || (text.includes('took') && text.includes('hour'))) {
    const hoursMatch = text.match(/(\d+)\s*(?:hours?|hrs?)/);
    const hours = hoursMatch ? parseInt(hoursMatch[1]) : null;
    const taskMatch = transcript.match(/(?:finished|completed|done with)\s+(?:the\s+)?([^,\.]+?)(?:\s+(?:took|spent|,|\.|$))/i);
    const taskName = taskMatch ? taskMatch[1].trim() : transcript.replace(/took.*|spent.*/i, '').trim();
    return { type: 'update_task', params: { taskName, status: 'completed', hours }, response: hours ? `Got it, marking as done and logging ${hours} hours.` : 'Marking that as completed.', provider: 'local' };
  }

  // Approve leave
  if (text.includes('approve') && (text.includes('leave') || text.includes('time off') || text.includes('vacation'))) {
    const noise = new Set(['approve', 'leave', 'time', 'off', 'vacation', 'request', 'the', 'a', 'an', 'his', 'her', 'their', 'please']);
    const words = text.split(/\s+/).filter((w: string) => !noise.has(w) && w.length > 1);
    const name = words.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '';
    return { type: 'approve_leave', params: { name }, response: `Approving ${name ? name + "'s" : 'the'} leave request.`, provider: 'local' };
  }

  return { type: 'unknown', response: "I didn't catch that. Try saying go to projects, or add a team member.", provider: 'local' };
}

// ── Main voice parse endpoint ────────────────────────────────────────────────
router.post('/parse', async (req: Request, res: Response) => {
  const { transcript, currentPath = '/', currentProjectId } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  console.log('[VoiceParse] Transcript:', transcript, '| Path:', currentPath);

  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const prompt = SYSTEM_PROMPT(currentPath, currentProjectId);
  const userMessage = `User said: "${transcript}"`;

  // ── 1. Gemini 2.0 Flash ──────────────────────────────────────────────────
  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt + '\n\n' + userMessage }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      ) as any;

      if (geminiRes.ok) {
        const data = await geminiRes.json() as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            console.log('[VoiceParse] ✅ Gemini success');
            return res.json({ ...parsed, provider: 'gemini' });
          } catch { /* fall through */ }
        }
      } else if (geminiRes.status === 429) {
        console.warn('[VoiceParse] Gemini rate limited → trying Groq');
      } else {
        console.warn('[VoiceParse] Gemini error:', geminiRes.status);
      }
    } catch (e) {
      console.warn('[VoiceParse] Gemini exception:', e);
    }
  }

  // ── 2. Groq Llama 3.1 8B ────────────────────────────────────────────────
  if (groqKey) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userMessage }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 300
        })
      }) as any;

      if (groqRes.ok) {
        const data = await groqRes.json() as any;
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            console.log('[VoiceParse] ✅ Groq success');
            return res.json({ ...parsed, provider: 'groq' });
          } catch { /* fall through */ }
        }
      } else if (groqRes.status === 429) {
        console.warn('[VoiceParse] Groq rate limited → using local parser');
      } else {
        console.warn('[VoiceParse] Groq error:', groqRes.status);
      }
    } catch (e) {
      console.warn('[VoiceParse] Groq exception:', e);
    }
  }

  // ── 3. Local parser — always works ──────────────────────────────────────
  console.log('[VoiceParse] ✅ Local parser');
  return res.json(localParse(transcript, currentProjectId));
});

export default router;
