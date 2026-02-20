import { apiUrl } from './api';

export interface AIInsightCandidate {
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

export interface AIInsightRequest {
  candidates: AIInsightCandidate[];
  tasks_in_progress: number;
  overdue_tasks: number;
}

export interface AIInsight {
  type: 'overload' | 'timeline_risk' | 'underutilization' | 'skill_gap' | 'health';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  affected_candidates?: string[];
  recommendation?: string;
  metrics?: Record<string, any>;
}

export interface AIInsightResponse {
  insights: AIInsight[];
  overall_health: {
    score: number;
    status: 'critical' | 'warning' | 'healthy';
    summary: string;
  };
  timestamp: string;
}

/**
 * Transform Jira issues and assignees into AI Insights request format
 */
export function transformJiraDataToAIInsights(
  jiraIssues: any[],
  employees: any[]
): AIInsightRequest {
  // Map employees to candidates
  const candidates: AIInsightCandidate[] = employees.map((emp: any) => {
    const empIssues = jiraIssues.filter((issue: any) => issue.assignee === emp.name);
    
    // Calculate current load (tasks in progress)
    const inProgressIssues = empIssues.filter((i: any) => 
      i.status?.toLowerCase?.()?.includes('in progress') ||
      i.status?.toLowerCase?.()?.includes('in_progress')
    );
    
    // Calculate average completion time (estimated from duration)
    const completedIssues = empIssues.filter((i: any) =>
      i.status?.toLowerCase?.()?.includes('done') ||
      i.status?.toLowerCase?.()?.includes('completed') ||
      i.status?.toLowerCase?.()?.includes('closed')
    );
    
    const avgCompletionTime = completedIssues.length > 0
      ? completedIssues.reduce((sum: number, i: any) => {
          const hours = typeof i.duration === 'string' ? parseInt(i.duration) : (i.duration || 0);
          return sum + hours;
        }, 0) / completedIssues.length
      : 0;
    
    // Calculate efficiency score (0-1, based on completion rate)
    const totalAssignedIssues = empIssues.length;
    const efficiencyScore = totalAssignedIssues > 0
      ? Math.min(1, completedIssues.length / totalAssignedIssues)
      : 0.5;
    
    // Calculate actual productive hours based on tasks
    const totalHours = empIssues.reduce((sum: number, i: any) => {
      const hours = typeof i.duration === 'string' ? parseInt(i.duration) : (i.duration || 0);
      return sum + hours;
    }, 0);
    
    return {
      id: emp.name.toLowerCase().replace(/\s+/g, '-'),
      name: emp.name,
      current_load: inProgressIssues.length,
      skills: emp.skills || [emp.role || 'Developer'],
      role_level: emp.role || 'Developer',
      avg_completion_time: Math.round(avgCompletionTime),
      efficiency_score: Number(efficiencyScore.toFixed(2)),
      base_productive_hours: 40,
      pto_hours_this_week: 0,
      holiday_hours_this_week: 0,
    };
  });
  
  // Calculate overall metrics
  const inProgressTasks = jiraIssues.filter((i: any) =>
    i.status?.toLowerCase?.()?.includes('in progress') ||
    i.status?.toLowerCase?.()?.includes('in_progress')
  ).length;
  
  const today = new Date();
  const overdueTasks = jiraIssues.filter((i: any) => {
    const dueDate = i.due ? new Date(i.due) : null;
    const isOverdue = dueDate && dueDate < today;
    const isNotDone = !(
      i.status?.toLowerCase?.()?.includes('done') ||
      i.status?.toLowerCase?.()?.includes('completed') ||
      i.status?.toLowerCase?.()?.includes('closed')
    );
    return isOverdue && isNotDone;
  }).length;
  
  return {
    candidates,
    tasks_in_progress: inProgressTasks,
    overdue_tasks: overdueTasks,
  };
}

/**
 * Fetch AI insights from the backend
 */
export async function fetchAIInsights(request: AIInsightRequest): Promise<AIInsightResponse | null> {
  try {
    console.log('[AI Insights] Fetching insights for', request.candidates.length, 'candidates');
    
    const response = await fetch(apiUrl('/api/v1/ai-insights'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      credentials: 'include',
    });
    
    if (!response.ok) {
      console.error('[AI Insights] Error fetching insights:', response.statusText);
      return null;
    }
    
    const data: AIInsightResponse = await response.json();
    console.log('[AI Insights] Received insights:', data);
    return data;
  } catch (error) {
    console.error('[AI Insights] Error:', error);
    return null;
  }
}
