import React, { useState, useEffect } from 'react';
import { AlertCircle, Zap } from 'lucide-react';
import { fetchAllIssuesHybrid } from '@/lib/jiraDbClient';
import { useAuth } from '@/contexts/AuthContext';

const DISPLAY_LIMIT = 12; // Maximum team members to display

interface TeamMember {
  email: string;
  name: string;
  role: string;
  utilization: number;
  totalHours: number;
  availableCapacity: number;
  issueCount: number;
}

export default function PeopleCapacityTab() {
  const { user, loading: authLoading, orgId } = useAuth();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    totalMembers: 0,
    avgUtilization: 0,
    overloadedCount: 0,
    availableCapacity: 0,
    displayedMembers: 0, // How many are actually shown
  });
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<any[]>([]);

  useEffect(() => {
    // SECURITY: Don't fetch data without auth and org
    if (authLoading || !user || !orgId) {
      if (!authLoading && user && !orgId) {
        setError('Organization not found. Please log in again.');
      }
      return;
    }

    const loadPeopleCapacityData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('[PeopleCapacity] Fetching from DB with org:', orgId);
        const { issues: allIssues, source } = await fetchAllIssuesHybrid();
        console.log(`[PeopleCapacity] Received ${allIssues.length} issues from ${source}`);

        if (!Array.isArray(allIssues) || allIssues.length === 0) {
          console.warn('[PeopleCapacity] No Jira issues found');
          setTeam([]);
          setMetrics({
            totalMembers: 0,
            avgUtilization: 0,
            overloadedCount: 0,
            availableCapacity: 0,
            displayedMembers: 0,
          });
          setLoading(false);
          return;
        }

        // Group issues by assignee
        const teamMap = new Map<string, TeamMember>();
        const CAPACITY_PER_PERSON = 160; // 5 days × 8 hours × 4 weeks

        allIssues.forEach((issue: any) => {
          const assignee = issue.assigneeEmail || issue.assignee || 'Unassigned';
          if (assignee === 'Unassigned') return;

          if (!teamMap.has(assignee)) {
            teamMap.set(assignee, {
              email: assignee,
              name: issue.assigneeName || assignee.split('@')[0],
              role: issue.issuetype || 'Team Member',
              utilization: 0,
              totalHours: 0,
              availableCapacity: 0,
              issueCount: 0
            });
          }

          const person = teamMap.get(assignee)!;
          person.issueCount += 1;

          // Calculate hours for this issue
          const estimate = issue.timeestimate_seconds
            ? Math.round(issue.timeestimate_seconds / 3600)
            : issue.story_points
            ? issue.story_points * 4
            : 4;

          person.totalHours += estimate;
        });

        const teamArray = Array.from(teamMap.values());
        const totalMembers = teamArray.length;

        console.log(`[PeopleCapacity] Processed ${totalMembers} team members`);

        // Calculate metrics for ALL members
        let totalUtilization = 0;
        let overloadedCount = 0;
        let totalAvailableCapacity = 0;

        teamArray.forEach((person) => {
          const utilization = (person.totalHours / CAPACITY_PER_PERSON) * 100;
          person.utilization = Math.round(utilization);
          person.availableCapacity = Math.max(0, CAPACITY_PER_PERSON - person.totalHours);

          totalUtilization += person.utilization;
          if (person.utilization > 100) overloadedCount++;
          totalAvailableCapacity += person.availableCapacity;
        });

        const avgUtilization = totalMembers > 0 ? Math.round(totalUtilization / totalMembers) : 0;

        // Sort by utilization and get top DISPLAY_LIMIT for the UI
        const sortedTeam = teamArray.sort((a, b) => b.utilization - a.utilization);
        const displayedTeam = sortedTeam.slice(0, DISPLAY_LIMIT);
        const displayedMembers = displayedTeam.length;

        setMetrics({
          totalMembers,        // How many team members exist
          avgUtilization,
          overloadedCount,
          availableCapacity: Math.round(totalAvailableCapacity),
          displayedMembers,    // How many we're showing (max 12)
        });

        // Process Jira projects - only items with due dates from Jira
        const projects = allIssues
          .filter((issue: any) => issue.due_date || issue.duedate)
          .slice(0, 5)
          .map((issue: any) => {
            const dueDate = issue.due_date || issue.duedate;
            const due = new Date(dueDate);
            const daysRemaining = Math.ceil((due.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            const isAtRisk = daysRemaining <= 7 && daysRemaining > 0;
            const storyPoints = issue.story_points || issue.storypoints || issue.customfield_10016 || 0;
            
            return {
              key: issue.key,
              projectName: `${issue.key} (${storyPoints})`,
              dueDate: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              daysRemaining,
              isAtRisk
            };
          });

        setUpcomingDeadlines(projects);
        setTeam(displayedTeam);
        setLoading(false);
      } catch (error) {
        console.error('[PeopleCapacity] Error loading data:', error);
        setError(error instanceof Error ? error.message : 'Failed to load data');
        setLoading(false);
      }
    };

    loadPeopleCapacityData();
    const interval = setInterval(loadPeopleCapacityData, 30000);
    return () => clearInterval(interval);
  }, [user, authLoading, orgId]);

  // Show loading state during auth
  if (authLoading) {
    return (
      <div className="w-full px-6 py-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading organization data...</p>
        </div>
      </div>
    );
  }

  // Show error if user/org not found
  if (!user || !orgId) {
    return (
      <div className="w-full px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-800">
          <div className="font-semibold mb-2">Organization Not Found</div>
          <div className="text-sm">You don't have access to an organization. Please log in with a valid account.</div>
          <button 
            onClick={() => window.location.href = '/login'}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-6 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-800">
          <div className="font-semibold mb-2">Error Loading Data</div>
          <div className="text-sm">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-light text-gray-900 tracking-tight">People & Capacity</h2>
          <p className="text-sm text-gray-500 mt-2">Real-time utilization tracked from Jira assignments</p>
        </div>
        <button className="px-6 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 flex items-center gap-2 transition-colors">
          <span className="text-lg">+</span>
          <span>Add Team Member</span>
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-5xl font-light text-gray-900 mb-3">{metrics.totalMembers}</div>
          <div className="text-sm text-gray-500 font-medium">Total Members</div>
          {metrics.displayedMembers < metrics.totalMembers && (
            <div className="text-xs text-gray-400 mt-2">Showing {metrics.displayedMembers}/{metrics.totalMembers}</div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-5xl font-light text-gray-900 mb-3">{metrics.avgUtilization}%</div>
          <div className="text-sm text-gray-500 font-medium">Avg Utilization</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-5xl font-light text-gray-900 mb-3">{metrics.overloadedCount}</div>
          <div className="text-sm text-gray-500 font-medium">Overloaded Count</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-5xl font-light text-gray-900 mb-3">{metrics.availableCapacity}h</div>
          <div className="text-sm text-gray-500 font-medium">Available Capacity</div>
        </div>
      </div>

      {/* Pending Skills Notification */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">4 skills pending verification</div>
            <div className="text-sm text-gray-500">Team members have updated their skills profiles — review and verify proficiency levels.</div>
          </div>
        </div>
        <button className="px-6 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 text-sm flex items-center gap-2 flex-shrink-0 transition-colors">
          <span>Review Skills</span>
          <span>→</span>
        </button>
      </div>

      {/* Team Members Grid */}
      {team.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-6">
            {team.map((person) => {
              const initials = person.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase();
              const isOverloaded = person.utilization > 100;
              const bgColor = isOverloaded ? 'bg-red-50' : 'bg-blue-50';
              const textColor = isOverloaded ? 'text-red-700' : 'text-blue-700';

              return (
                <div key={person.email} className={`${bgColor} rounded-xl p-6 cursor-pointer hover:shadow-lg transition-all border border-${isOverloaded ? 'red' : 'blue'}-100`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center font-semibold text-base flex-shrink-0">
                        {initials}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-base">{person.name}</div>
                        <div className="text-sm text-gray-600">{person.role}</div>
                      </div>
                    </div>
                    <span
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isOverloaded ? 'bg-red-500' : 'bg-green-500'
                      }`}
                    ></span>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-600 font-semibold tracking-wide">UTILIZATION</span>
                        <span className={`text-base font-semibold ${textColor}`}>{person.utilization}%</span>
                      </div>
                      <div className="w-full bg-gray-300 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                          style={{ width: `${Math.min(person.utilization, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-white bg-opacity-60 p-3 rounded-lg text-center border border-white/40">
                        <div className="text-xs text-gray-600 font-medium mb-1">Projects</div>
                        <div className="text-2xl font-light text-gray-900">{person.issueCount}</div>
                      </div>
                      <div className="bg-white bg-opacity-60 p-3 rounded-lg text-center border border-white/40">
                        <div className="text-xs text-gray-600 font-medium mb-1">Avail (2wk)</div>
                        <div className="text-2xl font-light text-gray-900">{Math.round(person.availableCapacity / 2)}h</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Show note if there are more members */}
          {metrics.displayedMembers < metrics.totalMembers && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                Showing top {metrics.displayedMembers} of {metrics.totalMembers} team members by utilization. 
                <button className="ml-2 font-semibold hover:underline">View all →</button>
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No team members found</p>
          <p className="text-sm text-gray-500 mt-1">Connect to Jira to see capacity data</p>
        </div>
      )}

      {/* Upcoming Deadlines */}
      {upcomingDeadlines.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-light text-gray-900 tracking-tight">Projects</h3>
              <p className="text-sm text-gray-500 mt-1">Active Jira projects and tasks</p>
            </div>
            <button className="text-sm text-gray-600 hover:text-gray-900 font-medium">View All →</button>
          </div>
          
          <div className="space-y-3">
            {upcomingDeadlines.map((project, index) => (
              <div
                key={index}
                className={`bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-md transition-shadow ${
                  project.isAtRisk ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{project.projectName}</div>
                </div>
                
                <div className="flex items-center gap-8 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">{project.dueDate}</div>
                  </div>
                  {project.daysRemaining > 0 && (
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${
                        project.isAtRisk ? 'text-red-700' : 'text-gray-900'
                      }`}>{project.daysRemaining}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
