/**
 * PTO Impact Calculator
 * Analyzes the impact of PTO on task assignment and completion probability
 */

export interface Task {
  title: string;
  priority: string;
  complexity: number; // 1-5
  deadline_hours: number;
  skills_required: string[];
}

export interface Candidate {
  id: string;
  name: string;
  current_load: number; // hours of current work
  skills: string[];
  role_level: string;
  avg_completion_time: number; // hours per task on average
  efficiency_score: number; // 0-1
  base_productive_hours: number; // 40 for standard week
  pto_hours_this_week: number;
  holiday_hours_this_week: number;
}

export interface PTOImpactResult {
  employee_id: string;
  name: string;
  initial_available_hours: number;
  pto_deduction_hours: number;
  net_available_after_pto: number;
  timeline_impact_days: number;
  task_completion_probability: number;
}

export interface PTOImpactResponse {
  impact_analysis: PTOImpactResult[];
  recommended_candidate_id: string;
  deferral_recommendation: boolean;
}

/**
 * Calculate PTO impact on task assignment
 */
export function calculatePTOImpact(
  task: Task,
  candidates: Candidate[],
  start_date: string
): PTOImpactResponse {
  // Calculate impact for each candidate
  const impactAnalysis: PTOImpactResult[] = candidates.map((candidate) => {
    // Calculate available hours for this week
    const initial_available_hours = Math.max(
      0,
      candidate.base_productive_hours - candidate.current_load
    );

    // Total leave hours this week
    const pto_deduction_hours = candidate.pto_hours_this_week + candidate.holiday_hours_this_week;

    // Net available after PTO
    const net_available_after_pto = Math.max(
      0,
      initial_available_hours - pto_deduction_hours
    );

    // Calculate effective available hours (accounting for efficiency)
    const effective_available_hours = net_available_after_pto * candidate.efficiency_score;

    // Estimate task hours needed
    const task_hours_needed = calculateTaskHours(task, candidate);

    // Calculate completion probability based on:
    // 1. Available capacity after PTO
    // 2. Skill match
    // 3. Complexity and efficiency
    const skill_match = calculateSkillMatch(task.skills_required, candidate.skills);
    const capacity_ratio = effective_available_hours > 0 
      ? Math.min(1, effective_available_hours / task_hours_needed)
      : 0;

    const complexity_factor = (6 - task.complexity) / 5; // Inverse: lower complexity = higher probability
    const efficiency_factor = candidate.efficiency_score;

    const task_completion_probability = Math.round(
      (skill_match * 0.4 + capacity_ratio * 0.4 + efficiency_factor * 0.2) * 100
    ) / 100;

    // Calculate timeline impact (days of delay)
    const timeline_impact_days = task_hours_needed > effective_available_hours
      ? Math.ceil((task_hours_needed - effective_available_hours) / 8)
      : 0;

    return {
      employee_id: candidate.id,
      name: candidate.name,
      initial_available_hours: Math.round(initial_available_hours * 100) / 100,
      pto_deduction_hours: Math.round(pto_deduction_hours * 100) / 100,
      net_available_after_pto: Math.round(net_available_after_pto * 100) / 100,
      timeline_impact_days,
      task_completion_probability: Math.min(1, task_completion_probability),
    };
  });

  // Find best candidate (highest completion probability and net available hours)
  let recommended_candidate_id = candidates[0]?.id || '';
  let highest_score = -1;

  impactAnalysis.forEach((analysis) => {
    // Score = completion probability * availability factor
    const score = analysis.task_completion_probability * 
                  (analysis.net_available_after_pto > 0 ? 1 : 0.5);
    
    if (score > highest_score) {
      highest_score = score;
      recommended_candidate_id = analysis.employee_id;
    }
  });

  // Recommend deferral if:
  // 1. Best candidate has < 40% completion probability OR
  // 2. Best candidate has no available time after PTO OR
  // 3. Task deadline cannot be met with anyone
  const best_candidate = impactAnalysis.find(a => a.employee_id === recommended_candidate_id);
  const deferral_recommendation = !best_candidate || 
    best_candidate.task_completion_probability < 0.4 || 
    best_candidate.net_available_after_pto === 0;

  return {
    impact_analysis: impactAnalysis,
    recommended_candidate_id,
    deferral_recommendation,
  };
}

/**
 * Calculate hours needed to complete task
 */
function calculateTaskHours(task: Task, candidate: Candidate): number {
  // Base calculation from complexity and average completion time
  const base_hours = candidate.avg_completion_time * (task.complexity / 3);
  
  // Adjust for priority
  const priority_multiplier = {
    'critical': 1.5,
    'high': 1.2,
    'medium': 1.0,
    'low': 0.8,
  }[task.priority.toLowerCase()] || 1.0;

  // Adjust for efficiency
  const efficiency_adjusted = (base_hours * priority_multiplier) / (candidate.efficiency_score || 1);

  // Use task deadline if provided and is less than calculated hours
  return Math.min(task.deadline_hours || efficiency_adjusted, efficiency_adjusted);
}

/**
 * Calculate skill match score (0-1)
 */
function calculateSkillMatch(required_skills: string[], candidate_skills: string[]): number {
  if (required_skills.length === 0) return 1.0;
  if (candidate_skills.length === 0) return 0.3; // Low match if no skills listed

  const matched = required_skills.filter((skill) =>
    candidate_skills.some(
      (cskill) =>
        cskill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(cskill.toLowerCase())
    )
  ).length;

  return Math.min(1, matched / required_skills.length);
}

/**
 * Format PTO impact results for display
 */
export function formatPTOImpact(response: PTOImpactResponse): string {
  const best = response.impact_analysis.find(a => a.employee_id === response.recommended_candidate_id);
  
  if (!best) return 'No suitable candidates found';

  let message = `Recommended: ${best.name}\n`;
  message += `Available after PTO: ${best.net_available_after_pto}h\n`;
  message += `Completion probability: ${Math.round(best.task_completion_probability * 100)}%\n`;
  
  if (best.timeline_impact_days > 0) {
    message += `Timeline impact: +${best.timeline_impact_days} days delay\n`;
  }

  if (response.deferral_recommendation) {
    message += `⚠️ Consider deferring this task`;
  }

  return message;
}
