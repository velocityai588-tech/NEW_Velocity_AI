import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Project Health Score Calculation
 * Health Score = (Timeline Score × 0.6) + (Capacity Score × 0.4)
 */

export interface TimelineData {
  actualProgress: number; // % of tasks completed (0-100)
  daysElapsed: number;    // days since project started (can exceed totalDays for past-due)
  totalDays: number;      // total planned duration in days
}

export interface TeamMember {
  name: string;
  utilization: number; // percentage (0-200+)
}

export interface CapacityData {
  teamMembers: TeamMember[];
}

/**
 * Calculate the Timeline Score component
 * Expected Progress = (Days Elapsed / Total Duration) × 100
 * Actual Progress = % tasks completed
 * Delta = Actual Progress − Expected Progress
 *
 * For past-due projects, expectedProgress can exceed 100%,
 * making delta negative and reflecting how far behind schedule the project is.
 */
export function calculateTimelineScore(data: TimelineData): number {
  const expectedProgress = (data.daysElapsed / data.totalDays) * 100;
  const delta = data.actualProgress - expectedProgress;

  if (delta >= 0) return 100;  // Ahead or on time
  if (delta >= -5) return 90;  // Slightly behind
  if (delta >= -10) return 70; // ~1 week behind
  if (delta >= -20) return 50; // ~2 weeks behind
  return 30;                   // >2 weeks behind or very overdue
}

/**
 * Calculate the Capacity Score component
 * Overload Ratio = Overloaded Team Members / Total Team Size
 * Tiered scoring based on overload ratio
 */
export function calculateCapacityScore(data: CapacityData): number {
  if (!data.teamMembers || data.teamMembers.length === 0) return 100;

  const overloadedCount = data.teamMembers.filter(
    (member) => member.utilization > 110
  ).length;

  const overloadRatio = overloadedCount / data.teamMembers.length;

  if (overloadRatio === 0) return 100;
  if (overloadRatio < 0.3) return 80;
  if (overloadRatio < 0.5) return 60;
  return 40;
}

/**
 * Calculate overall Project Health Score
 * Health Score = (Timeline Score × 0.6) + (Capacity Score × 0.4)
 */
export function calculateProjectHealthScore(
  timelineData: TimelineData,
  capacityData: CapacityData
): number {
  const timelineScore = calculateTimelineScore(timelineData);
  const capacityScore = calculateCapacityScore(capacityData);

  const healthScore = timelineScore * 0.6 + capacityScore * 0.4;
  return Math.round(healthScore);
}

/**
 * Get health score status and metadata for display
 */
export function getHealthScoreStatus(score: number) {
  if (score >= 80)
    return {
      status: "On Track",
      color: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
    };
  if (score >= 60)
    return {
      status: "Good Progress",
      color: "text-blue-700",
      bg: "bg-blue-50",
      border: "border-blue-200",
    };
  if (score >= 40)
    return {
      status: "At Risk",
      color: "text-yellow-700",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
    };
  return {
    status: "Critical",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
  };
}
