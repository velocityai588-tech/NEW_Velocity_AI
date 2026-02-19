import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, AlertTriangle, TrendingUp, Users, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  calculateProjectHealthScore, 
  getHealthScoreStatus,
  TimelineData,
  CapacityData
} from '@/lib/utils';

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string;
  due?: string;
  created?: string;
  storyPoints?: number;
  timetracking?: {
    originalEstimateSeconds?: number;
    timeSpentSeconds?: number;
  };
  worklog?: Array<{
    author?: { displayName: string };
    timeSpentSeconds?: number;
  }>;
  issueType?: string;
  priority?: string;
}

interface ProjectManagementDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  issues: JiraIssue[];
  healthScore: number;
  endDate?: string;
  weeksRemaining?: number;
  team: string[];
  fullscreen?: boolean;
}

// Status badge color
const getStatusColor = (healthScore: number) => {
  const status = getHealthScoreStatus(healthScore);
  return {
    bg: status.bg,
    border: status.border,
    text: status.color,
    label: status.status,
  };
};

// Calculate metrics from issues using actual Jira data
const calculateMetrics = (issues: JiraIssue[]) => {
  const completedStatuses = ['Done', 'DONE', 'Closed', 'CLOSED', 'Resolved', 'RESOLVED'];
  const completedCount = issues.filter(i => 
    completedStatuses.some(status => i.status?.toLowerCase().includes(status.toLowerCase()))
  ).length;

  // Use actual Jira timetracking data
  const totalEstSeconds = issues.reduce((sum, issue) => {
    return sum + (issue.timetracking?.originalEstimateSeconds || 0);
  }, 0);
  
  const actualSeconds = issues.reduce((sum, issue) => {
    return sum + (issue.timetracking?.timeSpentSeconds || 0);
  }, 0);

  // Convert seconds to hours
  const totalEstHours = Math.round(totalEstSeconds / 3600);
  const actualHours = Math.round(actualSeconds / 3600);
  const remainingHours = Math.max(0, totalEstHours - actualHours);
  const completion = Math.round((completedCount / issues.length) * 100);

  return {
    totalEstHours,
    actualHours,
    remainingHours,
    completion,
    completedCount,
    totalCount: issues.length,
  };
};

// Calculate team member utilization from actual Jira data
const calculateTeamUtilization = (team: string[], issues: JiraIssue[]) => {
  return team.map((member) => {
    // Get all issues assigned to this team member
    const memberIssues = issues.filter(i => i.assignee === member);
    
    // Calculate total estimated and spent hours for this member
    const estimatedSeconds = memberIssues.reduce((sum, issue) => {
      return sum + (issue.timetracking?.originalEstimateSeconds || 0);
    }, 0);
    
    const spentSeconds = memberIssues.reduce((sum, issue) => {
      return sum + (issue.timetracking?.timeSpentSeconds || 0);
    }, 0);

    // Convert to hours
    const estimatedHours = estimatedSeconds / 3600;
    const spentHours = spentSeconds / 3600;
    
    // Assume 40 hour work week (standard)
    const weeklyCapacity = 40;
    
    // Calculate utilization percentage based on time spent
    const utilization = estimatedHours > 0 
      ? Math.round((spentHours / weeklyCapacity) * 100)
      : 0;

    return {
      name: member,
      utilization: Math.min(utilization, 200), // Cap at 200% for display purposes
      estimatedHours: Math.round(estimatedHours),
      spentHours: Math.round(spentHours),
      assignedIssuesCount: memberIssues.length,
    };
  });
};

// Team member card
const TeamMemberCard = ({ member, index, issues }: { member: string; index: number; issues: JiraIssue[] }) => {
  // Get actual data for this team member from Jira
  const memberIssues = issues.filter(i => i.assignee === member);
  
  const estimatedSeconds = memberIssues.reduce((sum, issue) => {
    return sum + (issue.timetracking?.originalEstimateSeconds || 0);
  }, 0);
  
  const spentSeconds = memberIssues.reduce((sum, issue) => {
    return sum + (issue.timetracking?.timeSpentSeconds || 0);
  }, 0);

  const estimatedHours = estimatedSeconds / 3600;
  const spentHours = spentSeconds / 3600;
  const weeklyCapacity = 40;
  const usage = estimatedHours > 0 
    ? Math.round((spentHours / weeklyCapacity) * 100)
    : 0;
  
  const status = usage > 100 ? 'Overloaded' : usage > 85 ? 'High Load' : 'Healthy';
  const statusColor = usage > 100 ? 'text-red-700 bg-red-50' : usage > 85 ? 'text-yellow-700 bg-yellow-50' : 'text-green-700 bg-green-50';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary text-white text-sm font-light flex items-center justify-center">
            {member.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="min-w-0">
            <p className="font-light text-gray-900 truncate">{member}</p>
            <p className="text-xs text-gray-500 font-light">
              {memberIssues.length} issue{memberIssues.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <span className={`text-xs font-light px-2 py-1 rounded-full ${statusColor}`}>
          {status}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600 font-light">Allocated</span>
          <span className="font-light text-gray-900">{Math.round(estimatedHours)}h</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600 font-light">Spent</span>
          <span className="font-light text-gray-900">{Math.round(spentHours)}h</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600 font-light">Capacity Used</span>
          <span className={`font-light ${usage > 100 ? 'text-red-700' : usage > 85 ? 'text-yellow-700' : 'text-green-700'}`}>
            {usage}%
          </span>
        </div>
      </div>
    </div>
  );
};

// Task row
const TaskRow = ({ issue, index }: { issue: JiraIssue; index: number }) => {
  const completedStatuses = ['Done', 'DONE', 'Closed', 'CLOSED', 'Resolved', 'RESOLVED'];
  const isCompleted = completedStatuses.some(status => issue.status?.toLowerCase().includes(status.toLowerCase()));
  
  // Calculate progress based on time spent vs estimated
  const estimatedSeconds = issue.timetracking?.originalEstimateSeconds || 0;
  const spentSeconds = issue.timetracking?.timeSpentSeconds || 0;
  
  const progress = estimatedSeconds > 0 
    ? Math.min(100, Math.round((spentSeconds / estimatedSeconds) * 100))
    : isCompleted ? 100 : 0;

  const estimatedHours = Math.round(estimatedSeconds / 3600);
  const actualHours = Math.round(spentSeconds / 3600);

  return (
    <div className="flex items-center gap-4 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors border border-gray-200">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-light text-primary bg-primary/10 px-2 py-0.5 rounded">
            {issue.key}
          </span>
          <p className="font-light text-gray-900 truncate text-sm">{issue.summary.slice(0, 50)}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="font-light">{issue.assignee}</span>
          <span>•</span>
          <span className="font-light">{estimatedHours}h est.</span>
          <span>•</span>
          <span className="font-light">{actualHours}h spent</span>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-3">
        <div className="w-24">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${isCompleted ? 'bg-green-500' : progress > 75 ? 'bg-primary' : 'bg-yellow-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1 text-right font-light">{progress}%</p>
        </div>

        <div className="flex items-center gap-1">
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : progress < 50 ? (
            <AlertCircle className="w-4 h-4 text-yellow-600" />
          ) : (
            <TrendingUp className="w-4 h-4 text-blue-600" />
          )}
        </div>
      </div>
    </div>
  );
};

export default function ProjectManagementDashboard({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  issues,
  healthScore: propHealthScore,
  endDate,
  weeksRemaining,
  team,
  fullscreen = false,
}: ProjectManagementDashboardProps) {
  const metrics = calculateMetrics(issues);
  const teamUtilization = calculateTeamUtilization(team, issues);
  
  // Calculate timeline data from actual Jira dates
  const createdDates = issues
    .filter(i => i.created)
    .map(i => new Date(i.created!).getTime());
  
  const dueDates = issues
    .filter(i => i.due)
    .map(i => new Date(i.due!).getTime());
  
  const projectStartDate = createdDates.length > 0 
    ? new Date(Math.min(...createdDates))
    : new Date();
  
  const projectEndDate = dueDates.length > 0
    ? new Date(Math.max(...dueDates))
    : new Date(projectStartDate.getTime() + 14 * 24 * 60 * 60 * 1000); // Default 2 weeks
  
  const now = new Date();
  const totalDays = Math.max(1, Math.abs(Math.floor((projectEndDate.getTime() - projectStartDate.getTime()) / (1000 * 60 * 60 * 24))));
  // Don't cap daysElapsed—let the delta formula handle late projects naturally
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - projectStartDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  const timelineData: TimelineData = {
    actualProgress: metrics.completion, // % tasks completed
    daysElapsed,
    totalDays,
  };

  // Capacity data
  const capacityData: CapacityData = {
    teamMembers: teamUtilization,
  };

  // Calculate health score
  const calculatedHealthScore = calculateProjectHealthScore(timelineData, capacityData);
  
  const statusColor = getStatusColor(calculatedHealthScore);
  const daysRemaining = weeksRemaining ? Math.round(weeksRemaining * 7) : 44;
  const predictedDelay = Math.round(Math.random() * 20 - 5); // -5 to +15 days
  const predictedDate = new Date();
  predictedDate.setDate(predictedDate.getDate() + daysRemaining + predictedDelay);

  const dashboardContent = (
    <>
      <div className="bg-gray-50 border-b border-gray-200 p-6">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-1">{projectTitle}</h1>
            <p className="text-gray-600 font-light">8-Week Team Capacity Analysis</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Project Overview */}
        <div className="space-y-6">
          {/* Task Summary */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Task Overview</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 font-light">Total Tasks</p>
                <p className="text-2xl font-light text-gray-900">{metrics.totalCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-light">Completed</p>
                <p className="text-2xl font-light text-green-600">{metrics.completedCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-light">Completion Rate</p>
                <p className="text-2xl font-light text-blue-600">{metrics.completion}%</p>
              </div>
            </div>
          </div>

          {/* Team Members */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Team Members ({team.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {team.map((member, index) => (
                <TeamMemberCard key={member} member={member} index={index} issues={issues} />
              ))}
            </div>
          </div>

          {/* Recent Tasks */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Recent Tasks</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {issues.slice(0, 10).map((issue, index) => (
                <TaskRow key={issue.key} issue={issue} index={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // Fullscreen mode - render as full page
  if (fullscreen) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Back Button */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Projects
          </button>
        </div>
        <div className="bg-white">
          {dashboardContent}
        </div>
      </div>
    );
  }

  // Modal mode - wrap in Dialog
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
        {dashboardContent}
      </DialogContent>
    </Dialog>
  );
}
