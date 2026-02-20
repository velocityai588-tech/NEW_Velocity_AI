import { apiUrl } from './api';

export interface Task {
  title: string;
  priority: string;
  complexity: number;
  deadline_hours: number;
  skills_required: string[];
}

export interface Candidate {
  id: string;
  name: string;
  current_load: number;
  skills: string[];
  role_level: string;
  avg_completion_time: number;
  efficiency_score: number;
  base_productive_hours: number;
  pto_hours_this_week: number;
  holiday_hours_this_week: number;
}

export interface PTOImpactAnalysis {
  employee_id: string;
  name: string;
  initial_available_hours: number;
  pto_deduction_hours: number;
  net_available_after_pto: number;
  timeline_impact_days: number;
  task_completion_probability: number;
}

export interface PTOImpactResponse {
  impact_analysis: PTOImpactAnalysis[];
  recommended_candidate_id: string;
  deferral_recommendation: boolean;
}

/**
 * Calculate PTO impact for a task assignment
 */
export async function fetchPTOImpact(
  task: Task,
  candidates: Candidate[],
  start_date: string
): Promise<PTOImpactResponse | null> {
  try {
    console.log('[PTOImpact] Fetching PTO impact analysis', { task, candidates: candidates.length });

    const response = await fetch(apiUrl('/api/leave-approval/pto-impact'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task,
        candidates,
        start_date,
      }),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[PTOImpact] Error response:', response.statusText);
      return null;
    }

    const data: PTOImpactResponse = await response.json();
    console.log('[PTOImpact] Received analysis:', data);
    return data;
  } catch (error) {
    console.error('[PTOImpact] Error fetching PTO impact:', error);
    return null;
  }
}

/**
 * Convert Jira data to candidate format for PTO impact analysis
 */
export function convertJiraToCandidate(
  jiraIssue: any,
  employee: any,
  pto_hours_this_week: number = 0,
  holiday_hours_this_week: number = 0
): Candidate {
  // Calculate current load from Jira issues assigned to this person
  const current_load = jiraIssue?.duration || 0;

  // Extract skills from employee profile or issue
  const skills = employee?.skills || jiraIssue?.skills || [];

  // Average completion time from historical data or estimate
  const avg_completion_time = jiraIssue?.avg_completion_time || 8;

  // Efficiency score based on completion rate
  const efficiency_score = jiraIssue?.efficiency_score || 0.75;

  return {
    id: employee?.id || employee?.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
    name: employee?.name || 'Unknown Employee',
    current_load,
    skills: Array.isArray(skills) ? skills : [skills],
    role_level: employee?.role || 'Developer',
    avg_completion_time,
    efficiency_score,
    base_productive_hours: 40,
    pto_hours_this_week,
    holiday_hours_this_week,
  };
}
