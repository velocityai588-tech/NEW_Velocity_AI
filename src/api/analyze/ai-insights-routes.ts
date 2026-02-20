import express, { Router, Request, Response } from 'express';

export interface CapacityCandidate {
  id: string;
  name: string;
  current_load: number; // 0-100
  skills: string[];
  role_level: string;
  avg_completion_time: number;
  efficiency_score: number; // 0-1
  base_productive_hours: number;
  pto_hours_this_week: number;
  holiday_hours_this_week: number;
}

export interface AIInsightRequest {
  candidates: CapacityCandidate[];
  tasks_in_progress: number;
  overdue_tasks: number;
}

export interface AIInsight {
  trigger_type: string; // 'overload', 'timeline_risk', 'underutilization', 'skill_gap'
  severity: string; // 'critical', 'high', 'medium', 'low'
  affected_employee_ids: string[];
  description: string;
  recommended_action: string;
}

export interface AIInsightsResponse {
  insights: AIInsight[];
  overall_health: string; // 'healthy', 'at_risk', 'critical'
  priority_actions: string[];
}

const router = Router();

// Middleware to log requests
router.use((req, res, next) => {
  console.log(`[AI Insights Routes] Incoming request: ${req.method} ${req.path}`);
  next();
});

// Analyze candidates and generate insights
function analyzeInsights(request: AIInsightRequest): AIInsightsResponse {
  const insights: AIInsight[] = [];
  const affectedEmployees: Set<string> = new Set();
  let healthScore = 100;

  // Rule 1: Overload Detection
  request.candidates.forEach((candidate) => {
    const netAvailable = candidate.base_productive_hours - 
      candidate.pto_hours_this_week - 
      candidate.holiday_hours_this_week - 
      ((candidate.current_load / 100) * candidate.base_productive_hours);

    const utilizationPercent = (candidate.current_load);

    if (utilizationPercent > 120) {
      insights.push({
        trigger_type: 'overload',
        severity: 'critical',
        affected_employee_ids: [candidate.id],
        description: `${candidate.name} is overloaded at ${utilizationPercent}% utilization. Critical capacity issue.`,
        recommended_action: `Immediately redistribute tasks from ${candidate.name}. Consider extending deadlines or adding resources.`,
      });
      affectedEmployees.add(candidate.id);
      healthScore -= 20;
    } else if (utilizationPercent > 100) {
      insights.push({
        trigger_type: 'overload',
        severity: 'high',
        affected_employee_ids: [candidate.id],
        description: `${candidate.name} is over capacity at ${utilizationPercent}% utilization.`,
        recommended_action: `Review and balance workload for ${candidate.name} to prevent burnout.`,
      });
      affectedEmployees.add(candidate.id);
      healthScore -= 10;
    }
  });

  // Rule 2: Timeline Risk Detection
  if (request.overdue_tasks > 2) {
    insights.push({
      trigger_type: 'timeline_risk',
      severity: 'high',
      affected_employee_ids: Array.from(
        request.candidates
          .filter((c) => c.current_load > 80)
          .map((c) => c.id)
      ),
      description: `${request.overdue_tasks} tasks are overdue. Timeline risk is high.`,
      recommended_action: 'Prioritize overdue tasks and consider deadline extensions for lower-priority work.',
    });
    healthScore -= 15;
  }

  // Rule 3: Underutilization Detection
  request.candidates.forEach((candidate) => {
    if (candidate.current_load < 40) {
      insights.push({
        trigger_type: 'underutilization',
        severity: 'medium',
        affected_employee_ids: [candidate.id],
        description: `${candidate.name} is underutilized at ${candidate.current_load}% load. Opportunity for task allocation.`,
        recommended_action: `Assign additional tasks to ${candidate.name} to optimize team capacity.`,
      });
    }
  });

  // Rule 4: Skill Gap Detection
  const skills = new Set<string>();
  request.candidates.forEach((c) => {
    c.skills.forEach((s) => skills.add(s));
  });

  request.candidates.forEach((candidate) => {
    if (candidate.skills.length === 0) {
      insights.push({
        trigger_type: 'skill_gap',
        severity: 'medium',
        affected_employee_ids: [candidate.id],
        description: `${candidate.name} has no registered skills. Update profile for better task matching.`,
        recommended_action: `Encourage ${candidate.name} to update their skill profile in the system.`,
      });
    } else if (candidate.role_level === 'junior' && candidate.skills.length < 3) {
      insights.push({
        trigger_type: 'skill_gap',
        severity: 'low',
        affected_employee_ids: [candidate.id],
        description: `${candidate.name} (junior) has limited skills. Consider mentoring opportunities.`,
        recommended_action: `Provide training or pair ${candidate.name} with senior developers for skill development.`,
      });
    }
  });

  // Overall health assessment
  let overallHealth = 'healthy';
  if (healthScore < 40) {
    overallHealth = 'critical';
  } else if (healthScore < 70) {
    overallHealth = 'at_risk';
  }

  // Priority actions
  const priorityActions: string[] = [];
  const criticalInsights = insights.filter((i) => i.severity === 'critical');

  if (criticalInsights.length > 0) {
    priorityActions.push('Address critical overload situations immediately');
  }

  if (request.overdue_tasks > 0) {
    priorityActions.push('Resolve overdue tasks to get back on schedule');
  }

  const underutilized = request.candidates.filter((c) => c.current_load < 40);
  if (underutilized.length > 0) {
    priorityActions.push(`Redistribute ${underutilized.length} underutilized team members to active projects`);
  }

  if (priorityActions.length === 0) {
    priorityActions.push('Continue monitoring team capacity and deadlines');
  }

  return {
    insights: insights.slice(0, 8), // Limit to 8 insights for UI display
    overall_health: overallHealth,
    priority_actions: priorityActions,
  };
}

// POST /api/v1/ai-insights endpoint
router.post('/ai-insights', (req: Request, res: Response) => {
  try {
    console.log('[AI Insights Routes] POST /ai-insights endpoint called');

    const request: AIInsightRequest = req.body;

    // Validate request
    if (!request.candidates || !Array.isArray(request.candidates)) {
      return res.status(400).json({
        error: 'Invalid request: candidates array required',
      });
    }

    // Analyze and generate insights
    const response = analyzeInsights({
      candidates: request.candidates,
      tasks_in_progress: request.tasks_in_progress || 0,
      overdue_tasks: request.overdue_tasks || 0,
    });

    console.log(`[AI Insights Routes] Generated ${response.insights.length} insights`);

    return res.status(200).json(response);
  } catch (error) {
    console.error('[AI Insights Routes] Error:', error);
    return res.status(500).json({
      error: 'Failed to generate AI insights',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Catch-all for undefined routes (optional, handle gracefully)
router.use((req: Request, res: Response) => {
  console.log(`[AI Insights Routes] Unmatched route: ${req.method} ${req.path}`);
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

export default router;
