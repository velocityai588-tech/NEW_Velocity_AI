// src/api/jira/routes.ts
// API routes for Jira multi-tenant integration
import express, { Request, Response } from 'express';
import { jiraAuth } from './auth.js';

const router = express.Router();

// Debug middleware - log all requests to this router
router.use((req, res, next) => {
  console.log('[Jira Router] Incoming request:', req.method, req.path, req.url);
  console.log('[Jira Router] sessionID:', req.sessionID);
  console.log('[Jira Router] session.jiraStoreKey:', req.session?.jiraStoreKey);
  next();
});

// OAuth routes
router.get('/auth/connect', jiraAuth.login);
router.get('/auth/callback', jiraAuth.callback);

// Disconnect/logout route
router.post('/auth/disconnect', (req: Request, res: Response) => {
  jiraAuth.disconnect(req);
  res.json({ success: true, message: 'Jira account disconnected' });
});

// Check connection status
router.get('/auth/status', (req: Request, res: Response) => {
  console.log('[Jira Auth Status] ==== STATUS CHECK ====');
  console.log('[Jira Auth Status] Full session:', {
    sessionID: req.sessionID,
    jiraStoreKey: req.session?.jiraStoreKey,
    jiraCloudId: req.session?.jiraCloudId,
    jiraAccessibleResourcesCount: req.session?.jiraAccessibleResources?.length || 0,
    allSessionKeys: Object.keys(req.session || {}),
  });
  
  const connected = jiraAuth.isConnected(req);
  const siteInfo = jiraAuth.getSiteInfo(req);
  const availableSites = req.session?.jiraAccessibleResources || [];
  
  console.log('[Jira Auth Status] Connected:', connected);
  console.log('[Jira Auth Status] Available sites in session:', availableSites.length);
  if (availableSites.length > 0) {
    console.log('[Jira Auth Status] Sites:', availableSites.map((s: any) => ({ id: s.id, name: s.name })));
  }
  
  // Ensure response is valid JSON and includes all necessary fields
  const responseData = {
    connected: connected === true,
    site: siteInfo || null,
    availableSites: (availableSites || []).map((s: any) => ({ 
      id: s.id || '',
      name: s.name || '',
      url: s.url || ''
    })),
  };
  
  console.log('[Jira Auth Status] Response:', responseData);
  
  // Set cache headers to prevent stale responses
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  res.json(responseData);
});

// Switch to a different Jira site
router.post('/auth/switch-site/:siteId', (req: Request, res: Response) => {
  const { siteId } = req.params;
  const availableSites = req.session?.jiraAccessibleResources || [];
  const targetSite = availableSites.find((s: any) => s.id === siteId);
  
  console.log('[Jira Router] Switch site request, siteId:', siteId);
  console.log('[Jira Router] Available sites:', availableSites.map((s: any) => s.id));
  console.log('[Jira Router] Target site found:', !!targetSite, targetSite?.name);
  
  if (!targetSite) {
    console.error('[Jira Router] Site not found:', siteId);
    return res.status(404).json({ error: 'Site not found or not accessible' });
  }
  
  // Update session to use this site
  req.session.jiraCloudId = targetSite.id;
  console.log('[Jira Router] Updated jiraCloudId to:', req.session.jiraCloudId);
  
  req.session.save((err) => {
    if (err) {
      console.error('[Jira Router] Error saving session:', err);
      return res.status(500).json({ error: 'Failed to save session' });
    }
    console.log('[Jira Router] Session saved successfully');
    res.json({ 
      success: true, 
      site: { id: targetSite.id, name: targetSite.name, url: targetSite.url }
    });
  });
});

// Fetch issues for a specific project (multi-tenant)
router.get('/issues', async (req: Request, res: Response) => {
  // Prevent caching of this endpoint
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  
  try {
    console.log('[Jira Issues] Request received, sessionID:', req.sessionID);
    const projectKey = req.query.projectKey as string;
    console.log('[Jira Issues] projectKey:', projectKey);
    
    if (!projectKey) {
      console.log('[Jira Issues] Missing project key');
      return res.status(400).json({ error: 'Project key is required' });
    }

    // Get user's access token and cloudId
    const accessToken = await jiraAuth.getAccessToken(req);
    const cloudId = jiraAuth.getCloudId(req);
    
    console.log('[Jira Issues] accessToken:', accessToken ? 'EXISTS' : 'NULL');
    console.log('[Jira Issues] cloudId:', cloudId);
    
    if (!accessToken || !cloudId) {
      console.log('[Jira Issues] Not authenticated');
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please connect your Jira account first',
        requiresAuth: true,
      });
    }

    // Fetch issues from Jira Cloud API - use /rest/api/3/search/jql (required endpoint)
    const jql = `project = ${projectKey}`;
    const fields = 'key,summary,created,duedate,description,priority,status,assignee,issuetype,customfield_10015';
    const searchUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${encodeURIComponent(fields)}`;
    
    console.log('[Jira Issues] Search URL:', searchUrl);
    console.log('[Jira Issues] JQL:', jql);
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    console.log('[Jira Issues] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Jira Issues] Fetch issues failed:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch Jira issues',
        details: errorText 
      });
    }

    const data = await response.json() as any;
    console.log('[Jira Issues] Received', data.issues?.length || 0, 'issues');
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    
    const issues = (data.issues || []).map((issue: any) => {
      const fields = issue.fields || {};
      const created = fields.created || null;
      const due = fields.duedate || null;
      const startDate = fields.customfield_10015 || created || null;  // Use custom start field, fallback to created
      
      console.log(`[Jira Issues] Issue ${issue.key}:`, {
        created,
        due,
        startDate,
        customfield_10015: fields.customfield_10015
      })
      
      const duration = startDate && due 
        ? Math.ceil((new Date(due).getTime() - new Date(startDate).getTime()) / MS_PER_DAY) 
        : "";

      return {
        key: issue.key || "-",
        issueType: fields.issuetype?.name || "-",
        summary: fields.summary || "-",
        description: extractDescription(fields.description),
        priority: fields.priority?.name || "-",
        status: fields.status?.name || "-",
        assignee: fields.assignee?.displayName || "Unassigned",
        team: projectKey,
        created,
        due,
        duration,
        start: startDate,
        customfield_10015: fields.customfield_10015 || null,
      };
    });

    console.log('[Jira Issues] Formatted', issues.length, 'issues');
    if (issues.length > 0) {
      console.log('[Jira Issues] Sample formatted issue:', {
        key: issues[0].key,
        summary: issues[0].summary,
        start: issues[0].start,
        due: issues[0].due,
        created: issues[0].created
      })
    }

    // TODO: Persist issues to cache or database (fire-and-forget, don't block response)
    const dbIssues: DBJiraIssue[] = issues.map((iss: any) => ({
      cloud_id: cloudId!,
      project_key: projectKey,
      issue_key: iss.key,
      issue_type: iss.issueType,
      summary: iss.summary,
      description: iss.description,
      priority: iss.priority,
      status: iss.status,
      assignee: iss.assignee,
      team: iss.team,
      start_date: iss.start || null,
      due_date: iss.due || null,
      created_date: iss.created || null,
      duration: String(iss.duration ?? ''),
      custom_start: iss.customfield_10015 || null,
      raw_fields: {},
      fetched_by: req.session?.jiraUserId || null,
    }));
    console.log('[Jira Issues] DB upsert skipped (Supabase removed)');

    console.log('[Jira Issues] Sending response...');
    res.json({ issues });
    console.log('[Jira Issues] Response sent!');
  } catch (err) {
    console.error('[Jira Issues] Error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch Jira issues',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// Check if authentication is working
router.get('/test-auth', async (req: Request, res: Response) => {
  try {
    console.log('[Jira Test Auth] Testing authentication...');
    const accessToken = await jiraAuth.getAccessToken(req);
    const cloudId = jiraAuth.getCloudId(req);
    
    console.log('[Jira Test Auth] accessToken exists:', !!accessToken);
    console.log('[Jira Test Auth] cloudId:', cloudId);
    
    if (!accessToken || !cloudId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Use the correct Jira Cloud API format with cloudId
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`;
    
    console.log('[Jira Test Auth] Calling:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    console.log('[Jira Test Auth] Response status:', response.status);
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[Jira Test Auth] Failed:', response.status, data);
      return res.status(response.status).json({ error: 'Auth token invalid', details: data });
    }
    
    console.log('[Jira Test Auth] Success! User:', data.displayName);
    res.json({ success: true, user: data.displayName, accountId: data.accountId });
  } catch (err) {
    console.error('[Jira Test Auth] Error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// Fetch list of projects (multi-tenant)
router.get('/projects', async (req: Request, res: Response) => {
  try {
    console.log('[Jira Projects] Request received, sessionID:', req.sessionID);
    
    // Get user's access token and cloudId
    const accessToken = await jiraAuth.getAccessToken(req);
    const cloudId = jiraAuth.getCloudId(req);
    
    console.log('[Jira Projects] accessToken:', accessToken ? 'EXISTS' : 'NULL');
    console.log('[Jira Projects] cloudId:', cloudId);
    console.log('[Jira Projects] accessToken value (first 20 chars):', accessToken ? accessToken.substring(0, 20) : 'null');
    
    if (!accessToken || !cloudId) {
      console.log('[Jira Projects] Not authenticated');
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please connect your Jira account first',
        requiresAuth: true,
      });
    }

    // Fetch projects from Jira Cloud API using correct OAuth format with cloudId
    // Use /rest/api/2/project which works with read:jira-work scope
    const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/2/project`;
    
    console.log('[Jira Projects] Fetching from:', url);
    console.log('[Jira Projects] Authorization header:', `Bearer ${accessToken.substring(0, 20)}...`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    console.log('[Jira Projects] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Jira API] Fetch projects failed:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch Jira projects',
        details: errorText 
      });
    }

    const data = await response.json() as any;
    console.log('[Jira Projects] Raw data type:', Array.isArray(data) ? 'Array' : typeof data);
    console.log('[Jira Projects] Raw data length/keys:', Array.isArray(data) ? data.length : Object.keys(data).length);
    
    // API v2 /project returns direct array or paginated response
    const projectArray = Array.isArray(data) ? data : (data.values || data.projects || []);
    console.log('[Jira Projects] Project array length:', projectArray.length);
    
    const projects = projectArray.map((p: any) => ({
      id: p.id,
      key: p.key,
      title: p.name,
      description: p.description || '',
      avatar: p.avatarUrls?.['48x48'] || '',
    }));

    console.log('[Jira Projects] Formatted projects:', projects.length);

    // TODO: Persist projects to cache or database (fire-and-forget)
    const dbProjects = projects.map((p: any) => ({
      jira_project_id: String(p.id || ''),
      cloud_id: cloudId!,
      key: p.key,
      title: p.title || '',
      description: typeof p.description === 'string' ? p.description : '',
      avatar: p.avatar || '',
      category: '',
      fetched_by: req.session?.jiraUserId || null,
    }));
    console.log('[Jira Projects] DB upsert skipped (Supabase removed)');

    console.log('[Jira Projects] Sending response...');
    res.json({ projects });
    console.log('[Jira Projects] Response sent!');
  } catch (err) {
    console.error('[Jira API] Error fetching projects:', err);
    res.status(500).json({ 
      error: 'Failed to fetch Jira projects',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// Helper function to extract description
function extractDescription(desc: any): string {
  if (!desc) return "";
  if (typeof desc === "string") return desc;
  if (Array.isArray(desc)) return desc.join(" ");
  if (desc.content) {
    const parts: string[] = [];
    const walk = (nodes: any[]): void => {
      nodes.forEach((node: any) => {
        if (node.text) parts.push(node.text);
        if (node.content) walk(node.content);
      });
    };
    walk(desc.content);
    return parts.join(" ").trim();
  }
  return "";
}

// Extract employee skills from selected Jira projects
router.post('/extract-employee-skills', async (req: Request, res: Response) => {
  try {
    const { projectKeys } = req.body;

    if (!projectKeys || !Array.isArray(projectKeys) || projectKeys.length === 0) {
      return res.status(400).json({ error: 'projectKeys array is required' });
    }

    if (!jiraAuth.isConnected(req)) {
      return res.status(401).json({ error: 'Not connected to Jira' });
    }

    const employees: { [key: string]: { name: string; skills: Set<string>; projects: string[] } } = {};

    // Process each project
    for (const projectKey of projectKeys) {
      try {
        console.log(`[Jira Extract] Processing project: ${projectKey}`);

        // Get project issues
        const accessToken = await jiraAuth.getAccessToken(req);
        const cloudId = jiraAuth.getCloudId(req);
        
        if (!accessToken || !cloudId) {
          console.warn(`[Jira Extract] Missing auth for project ${projectKey}`);
          continue;
        }

        const issuesResponse = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search?jql=project=${projectKey}&maxResults=1000`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });
        
        if (!issuesResponse.ok) {
          console.warn(`[Jira Extract] Failed to fetch issues for project ${projectKey}`);
          continue;
        }

        const issuesData = await issuesResponse.json();
        const issues = issuesData.issues || [];

        console.log(`[Jira Extract] Found ${issues.length} issues in project ${projectKey}`);

        // Extract assignees and their work
        for (const issue of issues) {
          const assignee = issue.fields?.assignee;
          if (!assignee) continue;

          const assigneeName = assignee.displayName || assignee.name;
          const issueType = issue.fields?.issuetype?.name || '';
          const summary = issue.fields?.summary || '';
          const description = extractDescription(issue.fields?.description);

          // Initialize employee if not exists
          if (!employees[assigneeName]) {
            employees[assigneeName] = {
              name: assigneeName,
              skills: new Set(),
              projects: []
            };
          }

          // Add project if not already added
          if (!employees[assigneeName].projects.includes(projectKey)) {
            employees[assigneeName].projects.push(projectKey);
          }

          // Extract skills from issue type
          if (issueType) {
            employees[assigneeName].skills.add(issueType);
          }

          // Extract skills from summary and description using basic keyword analysis
          const text = `${summary} ${description}`.toLowerCase();

          // Common tech skills to look for
          const skillKeywords = [
            'react', 'angular', 'vue', 'javascript', 'typescript', 'python', 'java', 'c#', 'php', 'ruby',
            'node.js', 'express', 'django', 'flask', 'spring', 'hibernate', '.net', 'asp.net',
            'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind',
            'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
            'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github',
            'api', 'rest', 'graphql', 'microservices', 'testing', 'qa', 'devops',
            'mobile', 'ios', 'android', 'flutter', 'react native',
            'data analysis', 'machine learning', 'ai', 'ml', 'data science',
            'ui', 'ux', 'design', 'figma', 'sketch', 'photoshop'
          ];

          for (const skill of skillKeywords) {
            if (text.includes(skill)) {
              employees[assigneeName].skills.add(skill.charAt(0).toUpperCase() + skill.slice(1));
            }
          }
        }
      } catch (error) {
        console.error(`[Jira Extract] Error processing project ${projectKey}:`, error);
        continue;
      }
    }

    // Convert to array format
    const employeeArray = Object.values(employees).map(emp => ({
      name: emp.name,
      skills: Array.from(emp.skills),
      source: `Jira Projects: ${emp.projects.join(', ')}`
    }));

    console.log(`[Jira Extract] Extracted ${employeeArray.length} employees with skills`);

    res.json({
      employees: employeeArray,
      totalProjects: projectKeys.length,
      totalEmployees: employeeArray.length
    });

  } catch (error) {
    console.error('[Jira Extract] Error extracting employee skills:', error);
    res.status(500).json({ error: 'Failed to extract employee skills' });
  }
});

// Get team members from Jira projects with extracted skills
router.get('/team-members', async (req: Request, res: Response) => {
  try {
    console.log('[Jira Team Members] Request received');
    
    const accessToken = await jiraAuth.getAccessToken(req);
    const cloudId = jiraAuth.getCloudId(req);
    
    if (!accessToken || !cloudId) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please connect your Jira account first',
      });
    }

    // Fetch all projects
    const projectsUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/2/project`;
    const projectsResponse = await fetch(projectsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!projectsResponse.ok) {
      throw new Error('Failed to fetch projects');
    }

    const projectsData = await projectsResponse.json() as any;
    const projectArray = Array.isArray(projectsData) ? projectsData : (projectsData.values || projectsData.projects || []);

    // Extract team members from all project issues
    const employeeMap: Map<string, any> = new Map();
    const skillKeywords = [
      'react', 'angular', 'vue', 'javascript', 'typescript', 'python', 'java', 'c#', 'php', 'ruby',
      'node.js', 'express', 'django', 'flask', 'spring', 'hibernate', '.net', 'asp.net',
      'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind',
      'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github',
      'api', 'rest', 'graphql', 'microservices', 'testing', 'qa', 'devops',
      'mobile', 'ios', 'android', 'flutter', 'react native',
      'data analysis', 'machine learning', 'ai', 'ml', 'data science',
      'ui', 'ux', 'design', 'figma', 'sketch', 'photoshop'
    ];

    // Fetch issues from each project
    for (const project of projectArray) {
      try {
        const jql = `project = ${project.key}`;
        const searchUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=assignee,summary,description,issuetype`;
        
        const issuesResponse = await fetch(searchUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (issuesResponse.ok) {
          const issuesData = await issuesResponse.json() as any;
          const issues = issuesData.issues || [];

          for (const issue of issues) {
            const assignee = issue.fields?.assignee;
            if (!assignee) continue;

            const assigneeName = assignee.displayName || assignee.name;
            const issueType = issue.fields?.issuetype?.name || '';
            const summary = issue.fields?.summary || '';
            const description = (issue.fields?.description?.content || [])
              .map((block: any) => block.content?.map((c: any) => c.text).join('') || '')
              .join(' ');

            if (!employeeMap.has(assigneeName)) {
              employeeMap.set(assigneeName, {
                id: assignee.accountId,
                name: assigneeName,
                skills: new Set<string>(),
                projects: new Set<string>(),
              });
            }

            const emp = employeeMap.get(assigneeName);
            emp.projects.add(project.key);

            // Add issue type as skill
            if (issueType) {
              emp.skills.add(issueType);
            }

            // Extract skills from text
            const text = `${summary} ${description}`.toLowerCase();
            for (const skill of skillKeywords) {
              if (text.includes(skill)) {
                emp.skills.add(skill.charAt(0).toUpperCase() + skill.slice(1));
              }
            }
          }
        }
      } catch (projectError) {
        console.warn(`[Jira Team Members] Failed to fetch issues for project ${project.key}:`, projectError);
        continue;
      }
    }

    // Convert to array format for ML engine
    const teamMembers = Array.from(employeeMap.values()).map(emp => ({
      id: emp.id,
      name: emp.name,
      skills: Array.from(emp.skills),
      projects: Array.from(emp.projects),
      current_load: Math.round(Math.random() * 100), // Placeholder - must be integer for ML engine
      role_level: 'mid' as const, // Default - can be enhanced based on project role
      availability_hours: 160 - (Math.random() * 100 * 1.6), // Placeholder
      avg_completion_time: 40, // Default - can be enhanced with historical data
    }));

    console.log(`[Jira Team Members] Extracted ${teamMembers.length} team members`);

    res.json({ 
      success: true,
      count: teamMembers.length,
      teamMembers 
    });

  } catch (error) {
    console.error('[Jira Team Members] Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch team members',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Save extracted employee skills to CSV
router.post('/save-employee-skills', async (req: Request, res: Response) => {
  try {
    const { employees } = req.body;

    if (!employees || !Array.isArray(employees)) {
      return res.status(400).json({ error: 'employees array is required' });
    }

    // Convert to CSV format
    const csvLines = ['name,skills'];
    for (const employee of employees) {
      const skillsString = employee.skills.map(skill => `"${skill}"`).join(',');
      csvLines.push(`${employee.name},"${skillsString}"`);
    }

    const csvContent = csvLines.join('\n');

    // Write to CSV file
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(process.cwd(), 'public', 'data', 'employees.csv');

    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    console.log(`[Jira Save] Saved ${employees.length} employees to CSV`);

    res.json({
      success: true,
      message: `Saved ${employees.length} employees to CSV`,
      filePath: csvPath
    });

  } catch (error) {
    console.error('[Jira Save] Error saving employee skills:', error);
    res.status(500).json({ error: 'Failed to save employee skills' });
  }
});

// ============================================================
// API endpoints — frontend fetches Jira data from API
// These do NOT require an active Jira session/cookie.
// ============================================================

/**
 * GET /db/projects
 * Returns all Jira projects stored in DB.
 * Optional query: ?cloudId=xxx to filter by site.
 */
router.get('/db/projects', async (req: Request, res: Response) => {
  try {
    const cloudId = req.query.cloudId as string | undefined;
    console.log('[Jira DB] GET /db/projects, cloudId:', cloudId || '(all)');

    const projects = cloudId ? await getProjects(cloudId) : await getAllProjects();

    // Map to the same shape the frontend already expects
    const formatted = projects.map((p) => ({
      id: p.jira_project_id,
      key: p.key,
      title: p.title,
      description: p.description,
      avatar: p.avatar,
    }));

    res.json({ projects: formatted, source: 'database' });
  } catch (err) {
    console.error('[Jira DB] Error reading projects:', err);
    res.status(500).json({ error: 'Failed to read projects from database' });
  }
});

/**
 * GET /db/issues
 * Returns Jira issues from cache (Supabase removed - returns empty for fallback to API).
 */
router.get('/db/issues', async (req: Request, res: Response) => {
  try {
    console.log('[Jira DB] GET /db/issues - DB caching disabled, returning empty array');
    res.json({ issues: [], source: 'database' });
  } catch (err) {
    console.error('[Jira DB] Error reading issues:', err);
    res.status(500).json({ error: 'Failed to read issues from database' });
  }
});

/**
 * GET /db/all-issues
 * Returns ALL issues across all projects from cache (Supabase removed - returns empty).
 */
router.get('/db/all-issues', async (req: Request, res: Response) => {
  try {
    console.log('[Jira DB] GET /db/all-issues - DB caching disabled, returning empty array');
    res.json({ issues: [], source: 'database' });
  } catch (err) {
    console.error('[Jira DB] Error reading all issues:', err);
    res.status(500).json({ error: 'Failed to read issues from database' });
  }
});

export default router;
