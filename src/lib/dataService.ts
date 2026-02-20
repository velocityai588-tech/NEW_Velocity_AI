/**
 * Client-side data service for loading projects and computing metrics.
 * Works in the browser by fetching CSVs from public/data/ and processing them.
 */

import type {
  RawJiraRow,
  NormalizedEvent,
  MetricsResponse,
} from './types';

import {
  normalizeJira,
} from './normalizers';

import {
  automationCoverage,
  totalAutomations,
  estimatedTimeSavedHours,
  automationGrowthTrend,
  manualVsAutomatedByApp,
} from './metrics';
import { estimatedTimeSavedHoursByApp, estimatedReturnsByApp, estimatedTotalReturnsUSD } from './metrics';
import { estimatedCostSavedUSD, automationCoveragePrevious } from './metrics';
import { apiUrl } from './api';
import { fetchAllIssuesFromDB, fetchProjectsHybrid, type JiraIssueFromDB } from './jiraDbClient';

// ========================================
// CSV Parser (browser-compatible)
// ========================================

function parseCSV<T>(csvText: string): T[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    // Simple CSV parser that handles quoted fields
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];
      
      if (char === '"' && nextChar === '"' && inQuotes) {
        // Double quote escape - add one quote to output
        current += '"';
        j++; // Skip next quote
      } else if (char === '"') {
        // Toggle quote mode, don't add quote to output
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length === headers.length) {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] ?? '';
      });
      rows.push(obj as T);
    }
  }

  return rows;
}

async function fetchCSV(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${path}`);
  }
  return response.text();
}

// Fetch Jira issues (DB-first) and map to RawJiraRow[]
async function fetchJiraRowsFromApi(projectKey?: string): Promise<RawJiraRow[]> {
  try {
    // Try DB first
    let dbIssues: JiraIssueFromDB[] = [];
    if (projectKey) {
      const { fetchIssuesFromDB } = await import('./jiraDbClient');
      dbIssues = await fetchIssuesFromDB(projectKey);
    } else {
      dbIssues = await fetchAllIssuesFromDB();
    }

    if (dbIssues.length > 0) {
      console.log(`[dataService] Loaded ${dbIssues.length} issues from DB for normalizers`);
      return dbIssues.map((iss) => ({
        issue_id: iss.key || '',
        issue_key: iss.key || '',
        created_at: iss.created || '',
        event_type: 'issue_created',
        actor: iss.assignee || 'unknown',
        from_status: '',
        to_status: iss.status || '',
        project_id: iss.project_key || '',
        fields: JSON.stringify({}),
      }));
    }

    // Fallback to API
    const url = projectKey ? apiUrl(`/api/jira/issues?projectKey=${encodeURIComponent(projectKey)}`) : apiUrl('/api/jira/issues')
    const resp = await fetch(url)
    if (!resp.ok) return []
    const data = await resp.json()
    const issues = data.issues || []
    return issues.map((iss: any) => ({
      issue_id: iss.key || iss.id || '',
      issue_key: iss.key || iss.id || '',
      created_at: iss.created || iss.fields?.created || '',
      event_type: 'issue_created',
      actor: iss.assignee?.displayName || iss.fields?.assignee?.displayName || 'unknown',
      from_status: '',
      to_status: iss.status || iss.fields?.status?.name || '',
      project_id: iss.fields?.project?.key || iss.project || projectKey || '',
      fields: JSON.stringify(iss.fields || {}),
    }))
  } catch (e) {
    return []
  }
}

// ========================================
// Project interface for the list
// ========================================

export interface ProjectItem {
  id: string;
  title: string;
  category: string;
  description: string;
  image: string;
  tags: string[];
  color: string;
  // runtime source marker: 'jira' | 'local'
  source?: 'jira' | 'local';
}

// Fallback metadata (could be moved to a separate JSON file)
const projectDescriptions: Record<string, string> = {
  '1': 'Built an integrated inventory management and demand forecasting system for a mid-market retail chain. Reduced stockouts by 32% and optimized warehouse operations.',
  '2': 'Designed a multi-tenant cloud infrastructure orchestration platform enabling real-time resource allocation and auto-scaling.',
  '3': 'Developed a comprehensive healthcare tracking platform with HIPAA compliance and real-time patient monitoring.',
  '4': 'Developed an advanced quantitative analytics platform for portfolio optimization with ML-driven market risk prediction and real-time scenario modeling.',
  '5': 'Optimized supply chain logistics using advanced algorithms, reducing delivery times and costs significantly.',
  '6': 'Created an enterprise HR analytics suite for workforce planning, engagement tracking, and talent management.',
};

const projectColors: Record<string, string> = {
  '1': '#d97706',
  '2': '#2563EB',
  '3': '#059669',
  '4': '#7c3aed',
  '5': '#f59e0b',
  '6': '#10b981',
};

const projectTags: Record<string, string[]> = {
  '1': ['Inventory', 'Analytics', 'Operations'],
  '2': ['Cloud', 'Infrastructure', 'DevOps'],
  '3': ['Healthcare', 'Compliance', 'Real-time'],
  '4': ['Fintech', 'AI/ML', 'Risk Analysis'],
  '5': ['Supply Chain', 'Logistics', 'Optimization'],
  '6': ['HR', 'Analytics', 'Enterprise'],
};

const projectImages: Record<string, string> = {
  '1': 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=800&fit=crop',
  '2': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=800&fit=crop',
  '3': 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&h=800&fit=crop',
  '4': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=800&fit=crop',
  '5': 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&h=800&fit=crop',
  '6': 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=800&fit=crop',
};

// ========================================
// Public API
// ========================================

/**
 * Load list of projects from Jira only.
 * Reads from live API.
 */
export async function loadProjects(): Promise<ProjectItem[]> {
  console.log('[loadProjects] Starting to fetch projects (DB-first)...');
  
  // Use hybrid fetch: DB first, API fallback
  let jiraList: any[] = [];
  try {
    const { projects, source } = await fetchProjectsHybrid();
    jiraList = projects;
    console.log(`[loadProjects] Got ${jiraList.length} projects from ${source}`);
  } catch (err) {
    console.error('[loadProjects] Hybrid fetch failed:', err);
    jiraList = [];
  }

  const normalized: ProjectItem[] = [];

  // Normalize Jira projects first
  for (const p of jiraList) {
    const id = p.key || p.id || String(p.id || '');
    normalized.push({
      id,
      title: p.title || p.name || p.key || id,
      category: p.category || p.projectTypeKey || 'Project',
      description: p.description ? (typeof p.description === 'string' ? p.description : JSON.stringify(p.description)) : projectDescriptions[id] || '',
      image: p.avatar || p.avatarUrls?.['48x48'] || projectImages[id] || projectImages['1'],
      tags: projectTags[id] || [],
      color: projectColors[id] || '#6366f1',
      // @ts-ignore - add runtime marker for consumers
      source: 'jira',
    } as unknown as ProjectItem);
  }

  console.log('[loadProjects] Final normalized projects:', normalized.length, normalized);
  return normalized;
}

/**
 * Load raw event CSVs, normalize, and compute metrics for a specific project
 */
export async function loadMetrics(projectId: string): Promise<MetricsResponse> {
  const events = await getNormalizedEventsForProject(projectId);

  // Compute metrics from filtered events
  const HOURLY_RATE_USD = 100; // assumption used for cost estimates
  const estHours = estimatedTimeSavedHours(events);
  const estCost = estimatedCostSavedUSD(events, HOURLY_RATE_USD);
  const { previous: prevCoverage, current: currentCoverage } = automationCoveragePrevious(events, 30);

  return {
    automationCoverage: automationCoverage(events),
    totalAutomations: totalAutomations(events),
    estimatedTimeSavedHours: estHours,
    estimatedCostSavedUSD: estCost,
    hourlyRateUsedUSD: HOURLY_RATE_USD,
    automationCoveragePrevious: prevCoverage,
    automationCoverageDelta: automationCoverage(events) - prevCoverage,
    automationTrend: automationGrowthTrend(events),
    manualVsAutomated: manualVsAutomatedByApp(events),
  };
}

/**
 * Load overall metrics across all projects (aggregated).
 * This avoids re-fetching CSVs per-project when we only need a global number.
 */
export async function loadAllMetrics(): Promise<Partial<MetricsResponse>> {
  const [asanaCsv, zapierCsv] = await Promise.all([
    fetchCSV('/data/asana_events.csv').catch(() => ''),
    fetchCSV('/data/zapier_events.csv').catch(() => ''),
  ]);

  // Jira events come from live Jira via backend proxy — do NOT use CSV
  const jiraRows = await fetchJiraRowsFromApi()

  // Asana and Zapier removed - no longer loading from CSV
  const allEvents: NormalizedEvent[] = [
    ...normalizeJira(jiraRows),
  ];

  const HOURLY_RATE_USD = 100;
  const totalHours = estimatedTimeSavedHours(allEvents);
  const totalCost = estimatedCostSavedUSD(allEvents, HOURLY_RATE_USD);
  const perAppHours = estimatedTimeSavedHoursByApp(allEvents);
  
  // Investment costs per app (in USD) — adjust as needed
  const investmentCosts: Record<string, number> = {
    Jira: 10000,
  };
  
  const perAppReturns = estimatedReturnsByApp(allEvents, HOURLY_RATE_USD, investmentCosts);
  
  // Total investment across all platforms (50K total)
  const TOTAL_INVESTMENT_USD = 50000;
  const totalReturns = estimatedTotalReturnsUSD(allEvents, HOURLY_RATE_USD, TOTAL_INVESTMENT_USD);

  // Build monthly savings/investment trend from events
  const monthMap = new Map<string, NormalizedEvent[]>();
  for (const e of allEvents) {
    const d = new Date(e.timestamp);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(e);
  }

  const monthKeys = Array.from(monthMap.keys()).sort();
  const savingsInvestmentTrend: { label: string; investmentUSD: number; savingsUSD: number }[] = [];
  if (monthKeys.length > 0) {
    const investmentPerMonth = TOTAL_INVESTMENT_USD / monthKeys.length;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const key of monthKeys) {
      const [y, m] = key.split('-').map(Number);
      const eventsForMonth = monthMap.get(key) ?? [];
      const savings = estimatedCostSavedUSD(eventsForMonth, HOURLY_RATE_USD);
      const label = monthNames[(m - 1) % 12];
      savingsInvestmentTrend.push({ label, investmentUSD: Math.round(investmentPerMonth), savingsUSD: Math.round(savings) });
    }
  }

  return {
    estimatedTimeSavedHours: totalHours,
    estimatedCostSavedUSD: totalCost,
    hourlyRateUsedUSD: HOURLY_RATE_USD,
    perAppHours,
    perAppReturns,
    totalReturns,
    savingsInvestmentTrend,
  } as Partial<MetricsResponse> & { perAppHours: Record<string, number>; perAppReturns: Record<string, number>; totalReturns: number };
}

/**
 * Compute aggregated blocked hours across all Jira and Asana projects.
 * Uses the same UTC-normalized, merged-interval, business-day logic
 * as the capacity ledger component so numbers align across the app.
 */
export async function computeAllBlockedHours(): Promise<number | null> {
  try {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const msPerDay = MS_PER_DAY;

    let totalBlocked = 0;

    // Fetch Jira projects from DB first
    try {
      const { projects: jiraProjects } = await fetchProjectsHybrid();
      if (jiraProjects.length > 0) {
        for (const p of jiraProjects) {
          try {
            const { fetchIssuesFromDB: fetchDbIssues } = await import('./jiraDbClient');
            let issues: any[] = [];
            const dbIssues = await fetchDbIssues(p.key);
            if (dbIssues.length > 0) {
              issues = dbIssues.map((i: any) => ({
                key: i.key,
                assignee: i.assignee || 'Unassigned',
                created: i.created || null,
                start: i.start || null,
                due: i.due || null,
              }));
            } else {
              // Fallback to API
              const issuesRes = await fetch(`/api/jira/issues?projectKey=${encodeURIComponent(p.key)}`, { credentials: 'include' });
              if (!issuesRes.ok) continue;
              const issuesJson = await issuesRes.json();
              issues = issuesJson.issues || [];
            }

            const byAssigneeProj: Record<string, Array<{ s: number; e: number }>> = {};
            const startOfDayUTC = (d: any) => {
              const dd = new Date(d);
              return Date.UTC(dd.getFullYear(), dd.getMonth(), dd.getDate());
            };
            const businessDaysBetween = (startMs: number, endMs: number) => {
              let count = 0;
              for (let cur = startMs; cur < endMs; cur += msPerDay) {
                const dow = new Date(cur).getUTCDay();
                if (dow !== 0 && dow !== 6) count++;
              }
              return count;
            };

            for (const it of issues) {
              const sourceStart = it.created || it.start || null;
              const s = startOfDayUTC(sourceStart || new Date());
              const e = startOfDayUTC(it.due || it.due_date || sourceStart || new Date()) + msPerDay;
              const assigneeKey = (it.assignee || 'Unassigned');
              if (!byAssigneeProj[assigneeKey]) byAssigneeProj[assigneeKey] = [];
              byAssigneeProj[assigneeKey].push({ s, e });
            }

            const DEFAULT_WORKING_START = new Date('2025-12-01T00:00:00Z');
            const DEFAULT_WORKING_END = new Date('2026-01-01T00:00:00Z');
            const workingStartMs = Date.UTC(DEFAULT_WORKING_START.getUTCFullYear(), DEFAULT_WORKING_START.getUTCMonth(), DEFAULT_WORKING_START.getUTCDate());
            const workingEndMs = Date.UTC(DEFAULT_WORKING_END.getUTCFullYear(), DEFAULT_WORKING_END.getUTCMonth(), DEFAULT_WORKING_END.getUTCDate()) + msPerDay;
            const totalWindowDays = Math.max(0, businessDaysBetween(workingStartMs, workingEndMs));

            let totalIdleDaysForProject = 0;
            for (const assignee of Object.keys(byAssigneeProj)) {
              const intervals = byAssigneeProj[assignee].slice().sort((a, b) => a.s - b.s);
              const merged: Array<{ s: number; e: number }> = [];
              for (const intv of intervals) {
                if (merged.length === 0) merged.push({ ...intv });
                else {
                  const last = merged[merged.length - 1];
                  if (intv.s <= last.e) last.e = Math.max(last.e, intv.e);
                  else merged.push({ ...intv });
                }
              }

              let occupied = 0;
              for (const m of merged) {
                const clipStart = Math.max(m.s, workingStartMs);
                const clipEnd = Math.min(m.e, workingEndMs);
                if (clipEnd <= clipStart) continue;
                occupied += businessDaysBetween(clipStart, clipEnd);
              }

              const idleDays = Math.max(0, totalWindowDays - occupied);
              totalIdleDaysForProject += idleDays;
            }

            const projectBlockedHours = Math.round(totalIdleDaysForProject * 8 * 10) / 10;
            totalBlocked += projectBlockedHours;
          } catch (err) {
            // ignore per-project errors
          }
        }
      }
    } catch (err) {
      // ignore
    }

    // Fetch Asana projects
    try {
      const aRes = await fetch('/api/asana/projects');
      if (aRes.ok) {
        const aData = await aRes.json();
        const projects = aData.projects || [];
        for (const p of projects) {
          try {
            const tasksRes = await fetch(`/api/asana/issues?projectKey=${encodeURIComponent(p.id)}`);
            if (!tasksRes.ok) continue;
            const tasksJson = await tasksRes.json();
            const tasks = tasksJson.issues || [];

            const byAssigneeProjA: Record<string, Array<{ s: number; e: number }>> = {};
            const startOfDayUTC = (d: any) => {
              const dd = new Date(d);
              return Date.UTC(dd.getFullYear(), dd.getMonth(), dd.getDate());
            };
            const businessDaysBetween = (startMs: number, endMs: number) => {
              let count = 0;
              for (let cur = startMs; cur < endMs; cur += msPerDay) {
                const dow = new Date(cur).getUTCDay();
                if (dow !== 0 && dow !== 6) count++;
              }
              return count;
            };

            for (const t of tasks) {
              const sourceStart = t.startDate || t.start || t.created || null;
              const s = startOfDayUTC(sourceStart || new Date());
              const e = startOfDayUTC(t.due || t.due_on || sourceStart || new Date()) + msPerDay;
              const assigneeKey = (t.assignee || t.finalAssignee || 'Unassigned');
              if (!byAssigneeProjA[assigneeKey]) byAssigneeProjA[assigneeKey] = [];
              byAssigneeProjA[assigneeKey].push({ s, e });
            }

            const DEFAULT_WORKING_START = new Date('2025-12-01T00:00:00Z');
            const DEFAULT_WORKING_END = new Date('2026-01-01T00:00:00Z');
            const workingStartMs = Date.UTC(DEFAULT_WORKING_START.getUTCFullYear(), DEFAULT_WORKING_START.getUTCMonth(), DEFAULT_WORKING_START.getUTCDate());
            const workingEndMs = Date.UTC(DEFAULT_WORKING_END.getUTCFullYear(), DEFAULT_WORKING_END.getUTCMonth(), DEFAULT_WORKING_END.getUTCDate()) + msPerDay;
            const totalWindowDays = Math.max(0, businessDaysBetween(workingStartMs, workingEndMs));

            let totalIdleDaysForProjectA = 0;
            for (const assignee of Object.keys(byAssigneeProjA)) {
              const intervals = byAssigneeProjA[assignee].slice().sort((a, b) => a.s - b.s);
              const merged: Array<{ s: number; e: number }> = [];
              for (const intv of intervals) {
                if (merged.length === 0) merged.push({ ...intv });
                else {
                  const last = merged[merged.length - 1];
                  if (intv.s <= last.e) last.e = Math.max(last.e, intv.e);
                  else merged.push({ ...intv });
                }
              }

              let occupied = 0;
              for (const m of merged) {
                const clipStart = Math.max(m.s, workingStartMs);
                const clipEnd = Math.min(m.e, workingEndMs);
                if (clipEnd <= clipStart) continue;
                occupied += businessDaysBetween(clipStart, clipEnd);
              }

              const idleDays = Math.max(0, totalWindowDays - occupied);
              totalIdleDaysForProjectA += idleDays;
            }

            const projectBlockedHoursA = Math.round(totalIdleDaysForProjectA * 8 * 10) / 10;
            totalBlocked += projectBlockedHoursA;
          } catch (err) {
            // ignore per-project errors
          }
        }
      }
    } catch (err) {
      // ignore
    }

    return Math.round(totalBlocked * 10) / 10;
  } catch (err) {
    return null;
  }
}

/**
 * getNormalizedEventsForProject
 * Fetch raw CSVs, normalize them and return NormalizedEvent[] filtered by projectId.
 */
export async function getNormalizedEventsForProject(projectId: string): Promise<NormalizedEvent[]> {
  const [asanaCsv, zapierCsv] = await Promise.all([
    fetchCSV('/data/asana_events.csv').catch(() => ''),
    fetchCSV('/data/zapier_events.csv').catch(() => ''),
  ]);

  // Jira events come from live Jira via backend proxy — do NOT use CSV
  const jiraRows = await fetchJiraRowsFromApi()

  // Asana and Zapier removed - no longer loading from CSV
  const allEvents: NormalizedEvent[] = [
    ...normalizeJira(jiraRows),
  ];

  return allEvents.filter((e) => e.projectId === projectId);
}

// ========================================
// Project Detail Data Loaders
// ========================================

export interface GitHubEvent {
  event_id: string;
  occurred_at: string;
  event_type: string;
  actor: string;
  project_id: string;
  repo: string;
  properties: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
  files_changed?: number;
  additions?: number;
  deletions?: number;
}

export interface PullRequest {
  pr_id: string;
  title: string;
  author: string;
  status: 'pending-review' | 'approved' | 'changes-requested';
  created_at: string;
  reviewers: string[];
}

export interface TeamMember {
  project_id: string;
  member_id: string;
  name: string;
  role: string;
  avatar: string;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_due_today: number;
  current_task: string;
  prs_pending: number;
  reviews_pending: number;
}

export interface WeeklyCommit {
  project_id: string;
  week_start: string;
  week_end: string;
  commits_count: number;
}

export interface BurndownData {
  project_id: string;
  sprint_name: string;
  day: string;
  date: string;
  total_tasks: number;
  remaining_tasks: number;
}

/**
 * Load commits for a specific project from github_events.csv
 */
export async function loadCommitsByProject(projectId: string): Promise<Commit[]> {
  const csvText = await fetchCSV('/data/github_events.csv');
  const allEvents = parseCSV<GitHubEvent>(csvText);
  
  const commitEvents = allEvents.filter(
    (e) => e.project_id === projectId && e.event_type === 'commit'
  );
  
  return commitEvents.map((e) => {
    try {
      const propsStr = e.properties || '{}';
      const props = JSON.parse(propsStr);
      return {
        sha: props.sha || '',
        message: props.message || '',
        author: e.actor,
        date: e.occurred_at,
        files_changed: props.files_changed,
        additions: props.additions,
        deletions: props.deletions,
      };
    } catch (err) {
      console.error('Failed to parse commit properties:', e.properties, err);
      return {
        sha: '',
        message: '',
        author: e.actor,
        date: e.occurred_at,
      };
    }
  });
}

/**
 * Load pull requests for a specific project from github_events.csv
 */
export async function loadPullRequestsByProject(projectId: string): Promise<PullRequest[]> {
  const csvText = await fetchCSV('/data/github_events.csv');
  const allEvents = parseCSV<GitHubEvent>(csvText);
  
  const prEvents = allEvents.filter(
    (e) => e.project_id === projectId && e.event_type === 'pull_request'
  );
  
  return prEvents.map((e) => {
    try {
      const propsStr = e.properties || '{}';
      const props = JSON.parse(propsStr);
      return {
        pr_id: props.pr_id || e.event_id,
        title: props.title || '',
        author: e.actor,
        status: props.status || 'pending-review',
        created_at: e.occurred_at,
        reviewers: props.reviewers ? props.reviewers.split('|') : [],
      };
    } catch (err) {
      console.error('Failed to parse PR properties:', e.properties, err);
      return {
        pr_id: e.event_id,
        title: 'Unknown PR',
        author: e.actor,
        status: 'pending-review' as const,
        created_at: e.occurred_at,
        reviewers: [],
      };
    }
  });
}

/**
 * Load team members for a specific project
 */
export async function loadTeamMembersByProject(projectId: string): Promise<TeamMember[]> {
  const csvText = await fetchCSV('/data/github_events.csv');
  const allEvents = parseCSV<GitHubEvent>(csvText);
  
  const memberEvents = allEvents.filter(
    (e) => e.project_id === projectId && e.event_type === 'team_member'
  );
  
  return memberEvents.map((e) => {
    try {
      const propsStr = e.properties || '{}';
      const props = JSON.parse(propsStr);
      return {
        project_id: projectId,
        member_id: props.member_id || '',
        name: props.name || '',
        role: props.role || '',
        avatar: props.avatar || '',
        tasks_assigned: Number(props.tasks_assigned) || 0,
        tasks_completed: Number(props.tasks_completed) || 0,
        tasks_due_today: Number(props.tasks_due_today) || 0,
        current_task: props.current_task || '',
        prs_pending: Number(props.prs_pending) || 0,
        reviews_pending: Number(props.reviews_pending) || 0,
      };
    } catch (err) {
      console.error('Failed to parse team member properties:', e.properties, err);
      return {
        project_id: projectId,
        member_id: '',
        name: '',
        role: '',
        avatar: '',
        tasks_assigned: 0,
        tasks_completed: 0,
        tasks_due_today: 0,
        current_task: '',
        prs_pending: 0,
        reviews_pending: 0,
      };
    }
  });
}

/**
 * Load weekly commit counts for a specific project
 */
export async function loadWeeklyCommitsByProject(projectId: string): Promise<WeeklyCommit[]> {
  const csvText = await fetchCSV('/data/github_events.csv');
  const allEvents = parseCSV<GitHubEvent>(csvText);
  
  const weeklyEvents = allEvents.filter(
    (e) => e.project_id === projectId && e.event_type === 'weekly_commits'
  );
  
  return weeklyEvents.map((e) => {
    try {
      const propsStr = e.properties || '{}';
      const props = JSON.parse(propsStr);
      return {
        project_id: projectId,
        week_start: props.week_start || '',
        week_end: props.week_end || '',
        commits_count: Number(props.commits_count) || 0,
      };
    } catch (err) {
      console.error('Failed to parse weekly commits properties:', e.properties, err);
      return {
        project_id: projectId,
        week_start: '',
        week_end: '',
        commits_count: 0,
      };
    }
  });
}

/**
 * Load burndown data for a specific project
 */
export async function loadBurndownByProject(projectId: string): Promise<BurndownData[]> {
  const csvText = await fetchCSV('/data/github_events.csv');
  const allEvents = parseCSV<GitHubEvent>(csvText);
  
  const burndownEvents = allEvents.filter(
    (e) => e.project_id === projectId && e.event_type === 'burndown'
  );
  
  return burndownEvents.map((e) => {
    try {
      const propsStr = e.properties || '{}';
      const props = JSON.parse(propsStr);
      return {
        project_id: projectId,
        sprint_name: props.sprint_name || '',
        day: props.day || '',
        date: props.date || '',
        total_tasks: Number(props.total_tasks) || 0,
        remaining_tasks: Number(props.remaining_tasks) || 0,
      };
    } catch (err) {
      console.error('Failed to parse burndown properties:', e.properties, err);
      // Return empty object to avoid breaking the app
      return {
        project_id: projectId,
        sprint_name: '',
        day: '',
        date: '',
        total_tasks: 0,
        remaining_tasks: 0,
      };
    }
  }).filter(item => item.day !== ''); // Filter out failed parses
}

// ========================================
// Jira Data Loaders
// ========================================

export interface JiraIssue {
  issue_id: string;
  issue_key: string;
  created_at: string;
  event_type: string;
  actor: string;
  from_status: string;
  to_status: string;
  project_id: string;
  summary?: string;
  severity?: string;
  priority?: string;
  comment?: string;
  resolution?: string;
  is_automation: boolean;
}

export async function loadJiraIssuesByProject(projectId: string): Promise<JiraIssue[]> {
  const csvText = await fetchCSV('/data/jira_events.csv');
  const allEvents = parseCSV<{ issue_id: string; issue_key: string; created_at: string; event_type: string; actor: string; from_status: string; to_status: string; project_id: string; fields: string }>(csvText);
  
  const projectEvents = allEvents.filter((e) => e.project_id === projectId);
  
  return projectEvents.map((e) => {
    try {
      let fieldsStr = e.fields || '{}';
      
      // Fix common JSON issues in the CSV data
      // First, unescape any escaped quotes
      fieldsStr = fieldsStr.replace(/\\"/g, '"');
      
      // Handle property names that might be missing quotes
      fieldsStr = fieldsStr.replace(/([{,])\s*\\?([a-zA-Z_][a-zA-Z0-9_]*)\\?\s*:/g, '$1"$2":');
      
      // Handle unquoted values (but not if already quoted or if it's a number/boolean/null)
      fieldsStr = fieldsStr.replace(/:\s*([^,}\[\]"\s][^,}\[\]]*?)\s*([,}])/g, (match, value, ending) => {
        const trimmed = value.trim();
        // Don't quote numbers, booleans, null, or already quoted strings
        if (trimmed.match(/^(\d+(\.\d+)?|true|false|null)$/)) return `: ${trimmed}${ending}`;
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) return `: ${trimmed}${ending}`;
        // Escape any internal quotes and wrap in quotes
        const escaped = trimmed.replace(/"/g, '\\"');
        return `: "${escaped}"${ending}`;
      });
      
      const fields = JSON.parse(fieldsStr);
      return {
        issue_id: e.issue_id,
        issue_key: e.issue_key,
        created_at: e.created_at,
        event_type: e.event_type,
        actor: e.actor,
        from_status: e.from_status,
        to_status: e.to_status,
        project_id: e.project_id,
        summary: fields.summary,
        severity: fields.severity,
        priority: fields.priority,
        comment: fields.comment,
        resolution: fields.resolution,
        is_automation: e.actor.toLowerCase().includes('automation'),
      };
    } catch (err) {
      console.error('Failed to parse Jira issue fields:', e.fields, err);
      return {
        issue_id: e.issue_id,
        issue_key: e.issue_key,
        created_at: e.created_at,
        event_type: e.event_type,
        actor: e.actor,
        from_status: e.from_status,
        to_status: e.to_status,
        project_id: e.project_id,
        is_automation: e.actor.toLowerCase().includes('automation'),
      };
    }
  });
}

// ========================================
// Project Analytics Loader
// ========================================

export interface AIToolUsage {
  tool: string;
  hours: number;
}

export interface IntegrationSavings {
  asana: number;
  zapier: number;
}

export interface Task {
  task_name: string;
  start_date: string;
  end_date: string;
}

export interface JiraTicket {
  type: 'bug' | 'non-bug';
}

export interface TimeLog {
  date: string;
  hours_logged: number;
}

export interface ProjectAnalytics {
  project_id: string;
  project_name: string;
  category: string;
  planned_hours: number;
  actual_hours: number;
  ai_hours_used: number;
  ai_time_saved_hours: number;
  ai_time_saved_percent: number;
  tasks_automated_count: number;
  ai_tool_usage: AIToolUsage[];
  integration_savings: IntegrationSavings;
  tasks: Task[];
  jira_tickets: JiraTicket[];
  time_logs: TimeLog[];
  notes: string;
}

export async function loadProjectAnalytics(projectId: string): Promise<ProjectAnalytics | null> {
  const csvText = await fetchCSV('/data/projects-analytics.csv');
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) return null;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Format: id,name,category,"json_data"
    const match = line.match(/^([^,]+),([^,]+),([^,]+),(.+)$/);
    if (!match) continue;
    
    const id = match[1].trim();
    if (id !== projectId) continue;
    
    const name = match[2].trim();
    const category = match[3].trim();
    const jsonData = match[4].trim();
    
    try {
      // Remove outer quotes if present
      let cleanJson = jsonData.startsWith('"') && jsonData.endsWith('"') 
        ? jsonData.slice(1, -1) 
        : jsonData;
      
      // Unescape double quotes
      cleanJson = cleanJson.replace(/""/g, '"');
      
      // Parse the JSON data
      const data = JSON.parse(cleanJson);
      
      return {
        project_id: id,
        project_name: name,
        category,
        planned_hours: data.planned_hours || 0,
        actual_hours: data.actual_hours || 0,
        ai_hours_used: data.ai_hours_used || 0,
        ai_time_saved_hours: data.ai_time_saved_hours || 0,
        ai_time_saved_percent: data.ai_time_saved_percent || 0,
        tasks_automated_count: data.tasks_automated_count || 0,
        ai_tool_usage: data.ai_tool_usage || [],
        integration_savings: data.integration_savings || { asana: 0, zapier: 0 },
        tasks: data.tasks || [],
        jira_tickets: data.jira_tickets || [],
        time_logs: data.time_logs || [],
        notes: data.notes || '',
      };
    } catch (err) {
      console.error('Failed to parse project analytics JSON:', err);
      return null;
    }
  }
  
  return null;
}
