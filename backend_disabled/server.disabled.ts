import express, { Request, Response } from "express"
import cors from "cors"
import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const PORT = Number(process.env.API_PORT || 4000)

// ============ JIRA Configuration ============
const DOMAIN = process.env.JIRA_DOMAIN
const EMAIL = process.env.JIRA_EMAIL
const API_TOKEN = process.env.JIRA_API_TOKEN
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY
const TEAM_FIELD = process.env.JIRA_TEAM_FIELD_ID // Optional custom field key, e.g. customfield_12345

const auth = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64")
const JIRA_SEARCH_URL = DOMAIN ? `https://${DOMAIN}/rest/api/3/search/jql` : null
const MS_PER_DAY = 1000 * 60 * 60 * 24

const isJiraConfigReady = DOMAIN && EMAIL && API_TOKEN && PROJECT_KEY
if (!isJiraConfigReady) {
  console.warn("Jira API is not fully configured. Please set JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY in your .env file.")
}

// ============ ASANA Configuration ============
const ASANA_TOKEN = process.env.ASANA_TOKEN
const DEFAULT_ASANA_PROJECT_ID = process.env.ASANA_PROJECT_ID
const ASANA_BASE_URL = "https://app.asana.com/api/1.0"
const IMPORTED_ASSIGNEE_FIELD_GID = "1212641939726131"

const isAsanaConfigReady = !!ASANA_TOKEN
if (!isAsanaConfigReady) {
  console.warn("Asana API is not fully configured. Please set ASANA_TOKEN in your .env file.")
}

const extractDescription = (desc: any): string => {
  if (!desc) return ""
  if (typeof desc === "string") return desc
  if (Array.isArray(desc)) return desc.join(" ")
  if (desc.content) {
    const parts: string[] = []
    const walk = (nodes: any[]): void => {
      nodes.forEach((node: any) => {
        if (node.text) parts.push(node.text)
        if (node.content) walk(node.content)
      })
    }
    walk(desc.content)
    return parts.join(" ").trim()
  }
  return ""
}

app.get("/api/issues", async (req: Request, res: Response) => {
  // Get project key from query parameter or use default from env
  const projectKey = (req.query.projectKey as string) || PROJECT_KEY

  if (!projectKey) {
    return res.status(400).json({ error: "Project key is required. Provide it as ?projectKey=YOURKEY or set JIRA_PROJECT_KEY in .env" })
  }

  if (!isJiraConfigReady || !JIRA_SEARCH_URL) {
    return res.status(500).json({ error: "Jira configuration missing" })
  }

  try {
    // Try multiple Jira search endpoint variants to be compatible with instances
    // that have migrated old APIs. We'll try in order and return the first successful response.
    const jql = `project = ${projectKey} AND created >= -365d ORDER BY created DESC`
    const fields = [
      "key",
      "summary",
      "created",
      "duedate",
      "description",
      "priority",
      "status",
      "assignee",
      "issuetype",
      TEAM_FIELD,
    ].filter(Boolean)

    const tryEndpoints = [
      // Preferred new-style endpoint (some instances require /search/jql)
      { url: `https://${DOMAIN}/rest/api/3/search/jql`, method: 'POST', bodyAsJson: true },
      // Common search endpoint that accepts POST with JSON body
      { url: `https://${DOMAIN}/rest/api/3/search`, method: 'POST', bodyAsJson: true },
      // Fallback to GET with query param (some proxies prefer GET)
      { url: `https://${DOMAIN}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=500`, method: 'GET', bodyAsJson: false },
    ]

    let response: any = null
    let lastErrorText = ''

    for (const ep of tryEndpoints) {
      try {
        console.debug(`[Jira API] trying ${ep.method} ${ep.url}`)
        if (ep.method === 'POST') {
          response = await fetch(ep.url, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ jql, fields, maxResults: 500 }),
          })
        } else {
          response = await fetch(ep.url, {
            method: 'GET',
            headers: {
              Authorization: `Basic ${auth}`,
              Accept: 'application/json',
            },
          })
        }

        if (response.ok) break

        // collect text for diagnostics and continue to next endpoint
        const text = await response.text()
        lastErrorText = `url=${ep.url} status=${response.status} body=${text}`
        console.warn('[Jira API] non-OK response:', lastErrorText)
        // If 410 specifically returned, keep the text so we can show it to the client
      } catch (innerErr) {
        console.error('[Jira API] request error for endpoint', ep.url, innerErr)
        lastErrorText = innerErr instanceof Error ? innerErr.message : String(innerErr)
      }
    }

    if (!response || !response.ok) {
      // Return the last captured error text; this includes Jira's JSON body when available.
      return res.status(response ? response.status : 500).json({ error: 'Failed to fetch Jira issues', details: lastErrorText })
    }

    const data = await response.json() as any
    const issues = (data.issues || []).map((issue: any) => {
      const fields = issue.fields || {}
      const created = fields.created || null
      const due = fields.duedate || null
      const duration = created && due ? Math.ceil((new Date(due).getTime() - new Date(created).getTime()) / MS_PER_DAY) : ""

      return {
        key: issue.key || "-",
        issueType: fields.issuetype?.name || "-",
        summary: fields.summary || "-",
        description: extractDescription(fields.description),
        priority: fields.priority?.name || "-",
        status: fields.status?.name || "-",
        assignee: fields.assignee?.displayName || "Unassigned",
        team: TEAM_FIELD && fields[TEAM_FIELD] ? String(fields[TEAM_FIELD]) : "Team 1",
        created,
        due,
        duration,
      }
    })

    res.json({ issues })
  } catch (err) {
    console.error("[Jira API]", err)
    res.status(500).json({ error: "Failed to fetch Jira issues", details: err instanceof Error ? err.message : "Unknown error" })
  }
})

// Fetch list of projects from Jira (requires JIRA_DOMAIN + auth)
app.get('/api/projects', async (_req: Request, res: Response) => {
  if (!isJiraConfigReady || !DOMAIN) {
    return res.status(500).json({ error: 'Jira configuration missing' })
  }

  try {
    const url = `https://${DOMAIN}/rest/api/3/project/search?maxResults=200`
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const txt = await response.text()
      return res.status(response.status).json({ error: 'Failed to fetch projects from Jira', details: txt })
    }

    const data = await response.json() as any
    const values = data.values || data.projects || []
    const projects = values.map((p: any) => ({
      id: p.key || String(p.id),
      key: p.key || String(p.id),
      title: p.name || p.key || String(p.id),
      category: p.projectTypeKey || p.projectCategory?.name || 'Project',
      description: p.description ? (typeof p.description === 'string' ? p.description : JSON.stringify(p.description)) : '',
      avatar: p.avatarUrls ? (p.avatarUrls['48x48'] || p.avatarUrls['24x24'] || '') : '',
    }))

    res.json({ projects })
  } catch (err) {
    console.error('[Jira Projects]', err)
    res.status(500).json({ error: 'Failed to fetch Jira projects', details: err instanceof Error ? err.message : 'Unknown' })
  }
})

// ============ ASANA API Endpoints ============
app.get("/api/asana/issues", async (req: Request, res: Response) => {
  // Get project ID from query parameter or use default from env
  const projectId = (req.query.projectKey as string) || DEFAULT_ASANA_PROJECT_ID

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required. Provide it as ?projectKey=YOUR_PROJECT_ID or set ASANA_PROJECT_ID in .env" })
  }

  if (!isAsanaConfigReady) {
    return res.status(500).json({ error: "Asana configuration missing - ASANA_TOKEN not set" })
  }

  try {
    const response = await fetch(
      `${ASANA_BASE_URL}/tasks?project=${projectId}&opt_fields=name,completed,assignee.name,start_on,due_on,memberships.section.name,notes,custom_fields,custom_fields.enum_value,custom_fields.enum_value.name`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ASANA_TOKEN}`,
          Accept: "application/json",
        },
      }
    )

    if (!response.ok) {
      const message = await response.text()
      return res.status(response.status).json({ error: "Failed to fetch Asana tasks", details: message })
    }

    const data = await response.json() as any
    const tasks = (data.data || []).map((task: any) => {
      const startDate = task.start_on || null
      const due = task.due_on || null
      
      // Calculate duration from start_on to due_on (inclusive of both start and end dates)
      const duration = startDate && due 
        ? Math.ceil((new Date(due).getTime() - new Date(startDate).getTime()) / MS_PER_DAY) + 1
        : ""

      // Get imported assignee from custom field
      const importedAssigneeField = task.custom_fields?.find(
        (cf: any) => cf.gid === IMPORTED_ASSIGNEE_FIELD_GID
      )
      const importedAssignee = importedAssigneeField?.enum_value?.name || null

      // Use imported assignee if regular assignee is missing
      const finalAssignee = task.assignee?.name || importedAssignee || "Unassigned"

      return {
        key: task.gid || "-",
        issueType: "-",
        summary: task.name || "-",
        description: task.notes || "",
        priority: "-",
        status: task.completed ? "Done" : "Open",
        assignee: finalAssignee,
        team: task.memberships?.[0]?.section?.name || "-",
        startDate,
        due,
        duration,
      }
    })

    res.json({ issues: tasks })
  } catch (err) {
    console.error("[Asana API]", err)
    res.status(500).json({ error: "Failed to fetch Asana tasks", details: err instanceof Error ? err.message : "Unknown error" })
  }
})

// Fetch list of Asana projects (requires ASANA_TOKEN). Uses ASANA_WORKSPACE env if provided,
// otherwise returns the DEFAULT_ASANA_PROJECT_ID as a single-item list when available.
app.get('/api/asana/projects', async (_req: Request, res: Response) => {
  if (!isAsanaConfigReady) {
    return res.status(500).json({ error: 'Asana configuration missing' })
  }

  try {
    const workspace = process.env.ASANA_WORKSPACE_ID
    if (workspace) {
      const url = `${ASANA_BASE_URL}/projects?workspace=${workspace}&archived=false&opt_fields=gid,name,notes`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ASANA_TOKEN}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        const txt = await response.text()
        return res.status(response.status).json({ error: 'Failed to fetch Asana projects', details: txt })
      }

      const data = await response.json() as any
      const values = data.data || []
      const projects = values.map((p: any) => ({
        id: p.gid,
        key: p.gid,
        title: p.name,
        description: p.notes || '',
        avatar: '',
      }))

      return res.json({ projects })
    }

    // If no workspace provided, try returning the default project if set
    if (DEFAULT_ASANA_PROJECT_ID) {
      const url = `${ASANA_BASE_URL}/projects/${DEFAULT_ASANA_PROJECT_ID}?opt_fields=gid,name,notes`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${ASANA_TOKEN}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        const txt = await response.text()
        return res.status(response.status).json({ error: 'Failed to fetch Asana project', details: txt })
      }

      const data = await response.json() as any
      const p = data.data
      const project = p ? [{ id: p.gid, key: p.gid, title: p.name, description: p.notes || '', avatar: '' }] : []
      return res.json({ projects: project })
    }

    // No workspace and no default project configured
    return res.json({ projects: [] })
  } catch (err) {
    console.error('[Asana Projects]', err)
    return res.status(500).json({ error: 'Failed to fetch Asana projects', details: err instanceof Error ? err.message : 'Unknown' })
  }
})

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" })
})

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`)
  console.log(`  - Jira API: ${isJiraConfigReady ? 'configured' : 'NOT configured'}`)
  console.log(`  - Asana API: ${isAsanaConfigReady ? 'configured' : 'NOT configured'}`)
})
