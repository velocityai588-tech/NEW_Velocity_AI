/**
 * Capacity Analyzer
 * Calculates true available hours for team members based on:
 * - Base productive hours (standard weekly capacity)
 * - PTO hours this week
 * - Holiday hours this week
 * - Current workload
 */

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
}

export interface CapacityResponse {
  team_capacity: CapacityAnalysis[];
  total_available_capacity: number;
  total_base_capacity: number;
  timestamp: string;
}

/**
 * Calculate net available hours for a single employee
 */
export function calculateEmployeeCapacity(candidate: CapacityCandidate): CapacityAnalysis {
  // Start with base productive hours
  let available = candidate.base_productive_hours;

  // Subtract PTO hours
  available -= candidate.pto_hours_this_week;

  // Subtract holiday hours
  available -= candidate.holiday_hours_this_week;

  // Subtract current workload (convert load percentage to hours)
  // Assuming current_load is a percentage (0-100)
  const loadedHours = (candidate.current_load / 100) * candidate.base_productive_hours;
  available -= loadedHours;

  // Determine status
  let status: 'available' | 'busy' | 'pto' | 'holiday' | 'overbooked' = 'available';

  if (candidate.pto_hours_this_week > 0 && candidate.pto_hours_this_week >= candidate.base_productive_hours * 0.5) {
    status = 'pto';
  } else if (candidate.holiday_hours_this_week > 0 && candidate.holiday_hours_this_week >= candidate.base_productive_hours * 0.5) {
    status = 'holiday';
  } else if (available <= 0) {
    status = 'overbooked';
  } else if (candidate.current_load > 70) {
    status = 'busy';
  }

  return {
    employee_id: candidate.id,
    name: candidate.name,
    base_productive_hours: candidate.base_productive_hours,
    pto_hours_this_week: candidate.pto_hours_this_week,
    holiday_hours_this_week: candidate.holiday_hours_this_week,
    net_available_hours: Math.max(0, available), // Never negative
    status,
  };
}

/**
 * Calculate team capacity - analyzes all candidates
 */
export function analyzeTeamCapacity(candidates: CapacityCandidate[]): CapacityResponse {
  const teamCapacity = candidates.map(calculateEmployeeCapacity);

  const totalAvailable = teamCapacity.reduce((sum, c) => sum + c.net_available_hours, 0);
  const totalBase = teamCapacity.reduce((sum, c) => sum + c.base_productive_hours, 0);

  return {
    team_capacity: teamCapacity,
    total_available_capacity: totalAvailable,
    total_base_capacity: totalBase,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format capacity response for display
 */
export function formatCapacityAnalysis(response: CapacityResponse) {
  return {
    ...response,
    capacity_utilization_percent: response.total_base_capacity > 0 
      ? Math.round(((response.total_base_capacity - response.total_available_capacity) / response.total_base_capacity) * 100)
      : 0,
    team_capacity: response.team_capacity.map(c => ({
      ...c,
      utilization_percent: c.base_productive_hours > 0
        ? Math.round(((c.base_productive_hours - c.net_available_hours) / c.base_productive_hours) * 100)
        : 0,
    })),
  };
}
