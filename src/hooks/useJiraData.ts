import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { fetchAllIssuesHybrid, fetchProjectsHybrid, type JiraIssueFromDB } from '@/lib/jiraDbClient'

export interface JiraIssue {
  key: string
  issueType: string
  summary: string
  description: string
  priority: string
  status: string
  assignee: string
  team: string
  start: string | null
  due: string | null
  duration: number | string
  created?: string | null
  project?: string
  projectId?: string
  project_key?: string
  projectKey?: string
}

interface UseJiraDataReturn {
  issues: JiraIssue[]
  loading: boolean
  error: string | null
  refetch: () => void
  source: 'database' | 'api' | null
}

export function useJiraData(): UseJiraDataReturn {
  const { addToast } = useToast()
  const [issues, setIssues] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'database' | 'api' | null>(null)

  const fetchJiraIssues = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('[useJiraData] Fetching Jira data (DB-first)...')

      // Use the hybrid fetch — falls back to API
      const { issues: rawIssues, source: dataSource } = await fetchAllIssuesHybrid()
      setSource(dataSource)
      console.log(`[useJiraData] Loaded ${rawIssues.length} issues from ${dataSource}`)

      const mappedIssues: JiraIssue[] = rawIssues.map((iss: JiraIssueFromDB) => {
        const start = iss.start || iss.created || null
        const due = iss.due || null

        return {
          key: iss.key || '',
          issueType: iss.issueType || 'Task',
          summary: iss.summary || '',
          description: iss.description || '',
          project: iss.project_key || iss.team || '',
          priority: iss.priority || 'Medium',
          status: iss.status || 'Open',
          assignee: iss.assignee || 'Unassigned',
          team: iss.team || 'Engineering',
          start,
          due,
          duration: iss.duration || 8,
          created: iss.created || null,
          projectKey: iss.project_key || '',
        }
      })

      console.log('[useJiraData] Total issues mapped:', mappedIssues.length)
      setIssues(mappedIssues)

      if (mappedIssues.length > 0) {
        addToast({
          type: 'success',
          title: 'Jira Data Loaded',
          description: `Loaded ${mappedIssues.length} issues from ${dataSource === 'database' ? 'database' : 'Jira API'}`,
          duration: 3000,
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch Jira data'
      console.error('[useJiraData] Error:', err)
      setError(errorMsg)
      addToast({
        type: 'error',
        title: 'Jira Load Failed',
        description: errorMsg,
        duration: 5000,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJiraIssues()
  }, [])

  return {
    issues,
    loading,
    error,
    refetch: fetchJiraIssues,
    source,
  }
}
