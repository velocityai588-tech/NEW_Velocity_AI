import type { Issue } from './types'
import { fetchAllIssuesFromDB, fetchIssuesFromDB } from '@/lib/jiraDbClient'

interface CSVRow {
  [key: string]: string
}

function parseCSV(csvText: string): CSVRow[] {
  const lines = csvText.split('\n').filter(line => line.trim() && !line.startsWith('#'))
  if (lines.length === 0) return []

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let insideQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        insideQuotes = !insideQuotes
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''))
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''))
    return result
  }

  // Find the header line (first line that starts with issue_id)
  let headerIndex = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('issue_id,')) {
      headerIndex = i
      break
    }
  }

  const headers = parseCSVLine(lines[headerIndex])
  const data: CSVRow[] = []

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('issue_id,')) continue // Skip duplicate headers
    if (!line.trim()) continue
    
    const values = parseCSVLine(line)
    if (values.length < 3) continue // Skip invalid lines
    
    const row: CSVRow = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    data.push(row)
  }

  return data
}

function parseJSONField(jsonStr: string): Record<string, any> {
  try {
    // Handle escaped quotes
    const cleaned = jsonStr.replace(/""/g, '"')
    return JSON.parse(cleaned)
  } catch {
    return {}
  }
}

export async function loadJiraIssuesFromCSV(): Promise<Issue[]> {
  try {
    // API-first: read from live API
    const dbIssues = await fetchAllIssuesFromDB()

    if (dbIssues.length > 0) {
      console.log('[dataLoader] Loaded', dbIssues.length, 'issues from DB')
      const issueMap = new Map<string, Issue>()
      dbIssues.forEach((iss) => {
        if (!issueMap.has(iss.key)) {
          issueMap.set(iss.key, {
            key: iss.key,
            issueType: iss.issueType || 'Task',
            summary: iss.summary || `Issue ${iss.key}`,
            description: iss.description || '',
            priority: iss.priority || 'Medium',
            status: iss.status || 'Open',
            assignee: iss.assignee || 'Unassigned',
            team: iss.team || iss.project_key || '',
            start: iss.start || null,
            due: iss.due || null,
            duration: calculateDuration(iss.created),
          })
        }
      })
      return Array.from(issueMap.values())
    }

    // Fallback to API
    console.log('[dataLoader] No issues in DB, falling back to API')
    const resp = await fetch('/api/jira/issues', { credentials: 'include' })
    if (!resp.ok) throw new Error(`Failed to load Jira issues: ${resp.status}`)
    const data = await resp.json()
    const issuesRaw = data.issues || []

    const issueMap = new Map<string, Issue>()
    issuesRaw.forEach((iss: any) => {
      const key = iss.key || iss.id
      const fields = iss.fields || {}
      const projectId = fields.project?.key || iss.project || '1'
      const created = fields.created || iss.created || null
      const due = fields.duedate || fields.due || null

      if (!issueMap.has(key)) {
        issueMap.set(key, {
          key,
          issueType: fields.issuetype?.name || iss.issueType || 'Task',
          summary: fields.summary || iss.summary || `Issue ${key}`,
          description: (fields.description && typeof fields.description === 'string') ? fields.description : '',
          priority: fields.priority?.name || iss.priority || 'Medium',
          status: fields.status?.name || iss.status || 'Open',
          assignee: fields.assignee?.displayName || iss.assignee || 'Unassigned',
          team: `Project ${projectId}`,
          start: null,
          due,
          duration: calculateDuration(created),
        })
      } else {
        const existing = issueMap.get(key)!
        if (fields.status?.name) existing.status = fields.status.name
        if (fields.assignee?.displayName) existing.assignee = fields.assignee.displayName
      }
    })

    return Array.from(issueMap.values())
  } catch (error) {
    console.error('Error loading Jira issues:', error)
    throw error
  }
}

export async function loadJiraIssuesByProject(projectId: string): Promise<Issue[]> {
  // DB-first for a specific project
  try {
    const dbIssues = await fetchIssuesFromDB(projectId)
    if (dbIssues.length > 0) {
      console.log(`[dataLoader] Loaded ${dbIssues.length} issues for ${projectId} from DB`)
      return dbIssues.map((iss) => ({
        key: iss.key,
        issueType: iss.issueType || 'Task',
        summary: iss.summary || '',
        description: iss.description || '',
        priority: iss.priority || 'Medium',
        status: iss.status || 'Open',
        assignee: iss.assignee || 'Unassigned',
        team: iss.team || iss.project_key || '',
        start: iss.start || null,
        due: iss.due || null,
        duration: calculateDuration(iss.created),
      }))
    }
  } catch (err) {
    console.warn('[dataLoader] DB fetch failed for project, trying fallback:', err)
  }

  // Fallback
  const allIssues = await loadJiraIssuesFromCSV()
  return allIssues.filter(issue => 
    issue.team === `Project ${projectId}` || 
    issue.key.toLowerCase().includes(projectId.toLowerCase())
  )
}

export function getAvailableProjects(issues: Issue[]): string[] {
  const teams = new Set(issues.map(i => i.team))
  return Array.from(teams).sort()
}

function calculateDueDate(createdAt: string | null): string | null {
  if (!createdAt) return null
  try {
    const created = new Date(createdAt)
    // Random due date 3-14 days after creation
    const daysToAdd = 3 + Math.floor(Math.random() * 12)
    created.setDate(created.getDate() + daysToAdd)
    return created.toISOString()
  } catch {
    return null
  }
}

function calculateDuration(createdAt: string | null): number {
  if (!createdAt) return 0
  try {
    const created = new Date(createdAt)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - created.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.min(diffDays, 14) // Cap at 14 days
  } catch {
    return 0
  }
}
