import { useState, useCallback, useEffect } from 'react';
import { useJiraData } from './useJiraData';
import { fetchPTOImpact, convertJiraToCandidate, type PTOImpactResponse, type Task, type Candidate } from '@/lib/ptoCaculatorService';

export interface UsePTOImpactParams {
  task?: Task | null;
  ptoSchedule?: Record<string, { pto_hours: number; holiday_hours: number }>;
  startDate?: string;
  enabled?: boolean;
}

export interface UsePTOImpactResult {
  impact: PTOImpactResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  recommendedEmployee: { id: string; name: string } | null;
}

/**
 * Hook to calculate PTO impact using Jira data
 * Automatically fetches Jira issues and creates candidates with PTO data
 */
export function usePTOImpact({
  task,
  ptoSchedule = {},
  startDate = new Date().toISOString().split('T')[0],
  enabled = true,
}: UsePTOImpactParams): UsePTOImpactResult {
  const { issues: jiraIssues, loading: jiraLoading } = useJiraData();
  const [impact, setImpact] = useState<PTOImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateImpact = useCallback(async () => {
    if (!task || !enabled || jiraIssues.length === 0) {
      setImpact(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get unique assignees from Jira issues
      const assignees = Array.from(
        new Set(jiraIssues.map((issue: any) => issue.assignee).filter(Boolean))
      ) as string[];

      if (assignees.length === 0) {
        setError('No team members found in Jira');
        return;
      }

      // Build candidates from Jira data
      const candidates: Candidate[] = assignees.map((assigneeName: string) => {
        // Get all issues assigned to this person
        const assigneeIssues = jiraIssues.filter((issue: any) => issue.assignee === assigneeName);

        // Calculate current load (hours of assigned work)
        const current_load = assigneeIssues.reduce((sum: number, issue: any) => {
          const hours = typeof issue.duration === 'string' ? parseInt(issue.duration) : (issue.duration || 0);
          return sum + hours;
        }, 0);

        // Get unique skills from issues
        const skills = Array.from(
          new Set(
            assigneeIssues
              .flatMap((issue: any) => issue.skills || [])
              .filter(Boolean)
          )
        ) as string[];

        // Calculate average completion time from completed issues
        const completedIssues = assigneeIssues.filter((issue: any) =>
          issue.status?.toLowerCase?.()?.includes('done') ||
          issue.status?.toLowerCase?.()?.includes('completed')
        );

        const avg_completion_time =
          completedIssues.length > 0
            ? assigneeIssues.reduce((sum: number, issue: any) => {
                const hours = typeof issue.duration === 'string' ? parseInt(issue.duration) : (issue.duration || 0);
                return sum + hours;
              }, 0) / completedIssues.length
            : 8;

        // Calculate efficiency score
        const efficiency_score =
          assigneeIssues.length > 0
            ? completedIssues.length / assigneeIssues.length
            : 0.7;

        // Get PTO data
        const ptoDat = ptoSchedule[assigneeName] || { pto_hours: 0, holiday_hours: 0 };

        return {
          id: assigneeName.toLowerCase().replace(/\s+/g, '-'),
          name: assigneeName,
          current_load,
          skills,
          role_level: 'Engineer', // Could be enhanced with actual role data
          avg_completion_time,
          efficiency_score: Math.min(1, efficiency_score),
          base_productive_hours: 40,
          pto_hours_this_week: ptoDat.pto_hours || 0,
          holiday_hours_this_week: ptoDat.holiday_hours || 0,
        };
      });

      console.log('[usePTOImpact] Calculating impact with', candidates.length, 'candidates');

      // Fetch PTO impact
      const result = await fetchPTOImpact(task, candidates, startDate);

      if (result) {
        setImpact(result);
      } else {
        setError('Failed to calculate PTO impact');
      }
    } catch (err) {
      console.error('[usePTOImpact] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [task, jiraIssues, ptoSchedule, startDate, enabled]);

  useEffect(() => {
    calculateImpact();
  }, [calculateImpact]);

  const recommendedEmployee = impact
    ? {
        id: impact.recommended_candidate_id,
        name: impact.impact_analysis.find(a => a.employee_id === impact.recommended_candidate_id)?.name || 'Unknown',
      }
    : null;

  return {
    impact,
    loading: loading || jiraLoading,
    error,
    refetch: calculateImpact,
    recommendedEmployee,
  };
}
