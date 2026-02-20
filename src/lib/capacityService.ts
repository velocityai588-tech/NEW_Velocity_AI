import { apiUrl } from './api';

export interface CapacityCandidate {
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

export interface CapacityAnalysis {
  employee_id: string;
  name: string;
  base_productive_hours: number;
  pto_hours_this_week: number;
  holiday_hours_this_week: number;
  net_available_hours: number;
  status: 'available' | 'busy' | 'pto' | 'holiday' | 'overbooked';
  utilization_percent?: number;
}

/**
 * Fetch team capacity analysis from backend
 */
export async function fetchTeamCapacity(candidates: CapacityCandidate[]): Promise<CapacityAnalysis[] | null> {
  try {
    console.log('[TeamCapacity] Fetching capacity analysis for', candidates.length, 'employees');

    const response = await fetch(apiUrl('/api/v1/analyze/capacity'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ candidates }),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('[TeamCapacity] Error response:', response.statusText);
      return null;
    }

    const data: CapacityAnalysis[] = await response.json();
    console.log('[TeamCapacity] Received analysis:', data);
    return data;
  } catch (error) {
    console.error('[TeamCapacity] Error fetching capacity:', error);
    return null;
  }
}

/**
 * Convert Jira issue data to CapacityCandidate format
 */
export function convertJiraToCapacityCandidate(
  jiraIssue: any,
  employee: any,
  ptoHours: number = 0,
  holidayHours: number = 0
): CapacityCandidate {
  return {
    id: employee?.name || jiraIssue.assignee || 'unknown',
    name: employee?.name || jiraIssue.assignee || 'Unknown Employee',
    current_load: employee?.currentLoaded || 0,
    skills: employee?.skills || [],
    role_level: employee?.role || 'developer',
    avg_completion_time: 8,
    efficiency_score: employee?.completionRate || 0.8,
    base_productive_hours: 40,
    pto_hours_this_week: ptoHours,
    holiday_hours_this_week: holidayHours,
  };
}
