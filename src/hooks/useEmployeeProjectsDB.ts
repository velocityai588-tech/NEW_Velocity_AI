import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { format, differenceInDays } from 'date-fns';

// ─── Helpers ────────────────────────────────────────────────────────────────

function isDone(status: string) {
  return /^(completed|done)$/i.test(status || '');
}

function isInProgress(status: string) {
  return /in.?progress/i.test(status || '');
}

function urgencyGroup(dueDateStr: string | null, today: Date): 'overdue' | 'urgent' | 'this_week' | 'later' {
  if (!dueDateStr) return 'later';
  const days = differenceInDays(new Date(dueDateStr), today);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'this_week';
  return 'later';
}

// ─── useEmployeeProjectsDB (project list) ───────────────────────────────────

export function useEmployeeProjectsDB() {
  const { user, orgId, activeTeamId } = useAuth();
  const [projectsView, setProjectsView] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !orgId) { setIsLoading(false); return; }
    setIsLoading(true);

    try {
      // 1. Project IDs where this user has tasks
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('assignee_id', user.id);

      const projectIds = [...new Set((taskRows || []).map((t: any) => t.project_id).filter(Boolean))];

      if (projectIds.length === 0) {
        setProjectsView([]);
        setIsLoading(false);
        return;
      }

      // 2. Projects with all tasks + blockers
      let query = supabase
        .from('projects')
        .select(`
          id, name, start_date, end_date, status,
          tasks (
            id, name, status, due_date, estimated_hours, assignee_id, is_blocked,
            task_blockers ( id, blocker_description, blocking_user_name, resolved )
          )
        `)
        .eq('organization_id', orgId)
        .in('id', projectIds);

      if (activeTeamId) {
        query = query.eq('team_id', activeTeamId);
      }

      const { data: projects } = await query.order('end_date', { ascending: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mapped = (projects || []).map((proj: any) => {
        const allTasks: any[] = proj.tasks || [];
        const myTasks = allTasks.filter((t: any) => t.assignee_id === user.id);

        // Task counts
        const completed = myTasks.filter((t: any) => isDone(t.status));
        const inProgress = myTasks.filter((t: any) => isInProgress(t.status));
        const blocked = myTasks.filter((t: any) => t.is_blocked);
        const notStarted = myTasks.filter((t: any) => !isDone(t.status) && !isInProgress(t.status) && !t.is_blocked);

        // Next priority task
        const incomplete = myTasks.filter((t: any) => !isDone(t.status));
        incomplete.sort((a: any, b: any) => {
          const aDate = a.due_date ? new Date(a.due_date).getTime() : 9e12;
          const bDate = b.due_date ? new Date(b.due_date).getTime() : 9e12;
          const aOverdue = a.due_date && new Date(a.due_date) < today;
          const bOverdue = b.due_date && new Date(b.due_date) < today;
          if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
          return aDate - bDate;
        });
        const nextTaskRaw = incomplete[0];
        let nextTask = null;
        if (nextTaskRaw) {
          const activeBlockers = (nextTaskRaw.task_blockers || []).filter((b: any) => !b.resolved);
          nextTask = {
            id: nextTaskRaw.id,
            name: nextTaskRaw.name,
            status: nextTaskRaw.status || 'Not Started',
            due_date: nextTaskRaw.due_date,
            estimated_hours: nextTaskRaw.estimated_hours || 0,
            is_blocked: nextTaskRaw.is_blocked || false,
            blocker_description: activeBlockers[0]?.blocker_description,
            blocking_user: activeBlockers[0]?.blocking_user_name,
          };
        }

        // Capacity (estimated hours as proxy)
        const allocatedHours = myTasks.reduce((s: number, t: any) => s + (t.estimated_hours || 0), 0);
        const doneHours = completed.reduce((s: number, t: any) => s + (t.estimated_hours || 0), 0);
        const utilization = allocatedHours > 0 ? Math.round((doneHours / allocatedHours) * 100) : 0;

        // Progress %
        const progress = myTasks.length > 0 ? Math.round((completed.length / myTasks.length) * 100) : 0;

        // Status + health
        const startDate = proj.start_date ? new Date(proj.start_date) : new Date();
        const endDate = proj.end_date ? new Date(proj.end_date) : new Date(Date.now() + 30 * 86400000);
        const remainingDays = differenceInDays(endDate, today);
        const isCompleted = progress === 100 || isDone(proj.status || '');
        const isAtRisk = !isCompleted && remainingDays <= 5 && progress < 80;
        const status = isCompleted ? 'Completed' : isAtRisk ? 'At Risk' : 'In Progress';
        const statusColor = isCompleted ? 'text-[#78716C]' : isAtRisk ? 'text-[#BE123C]' : 'text-[#0F766E]';
        const healthColor = isCompleted ? 'text-[#78716C] border-[#E7E5E4]' : isAtRisk ? 'text-[#BE123C] border-[#FECDD3]' : 'text-[#1C1917] border-[#E7E5E4]';
        const health = isCompleted ? 100 : isAtRisk ? Math.max(20, progress - 20) : Math.max(60, progress);

        // Team initials (from all task assignee IDs — abbreviated)
        const assigneeIds = [...new Set(allTasks.map((t: any) => t.assignee_id).filter(Boolean))];
        const team = (assigneeIds as string[]).slice(0, 3).map((id) => id.substring(0, 2).toUpperCase());

        return {
          id: proj.id,
          name: proj.name,
          dates: `${format(startDate, 'MMM d')} – ${format(endDate, 'MMM d')}`,
          remaining: isCompleted ? 'Completed' : remainingDays > 0 ? `${remainingDays}d remaining` : 'Overdue',
          status,
          statusColor,
          health,
          healthColor,
          team,
          yourHours: `${allocatedHours}h`,
          progress,
          totalHoursLogged: doneHours,
          totalHoursEstimated: allocatedHours,
          insight: isAtRisk ? { text: 'Nearing deadline with pending tasks.' } : null,
          your_tasks: {
            total: myTasks.length,
            completed: completed.length,
            in_progress: inProgress.length,
            not_started: notStarted.length,
            blocked: blocked.length,
          },
          next_task: nextTask,
          capacity: { allocated_hours: allocatedHours, logged_hours: doneHours, utilization_percentage: utilization },
        };
      });

      setProjectsView(mapped);
    } catch (err) {
      console.error('[useEmployeeProjectsDB] error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, orgId, activeTeamId]);

  useEffect(() => { load(); }, [load]);

  return { projectsView, isLoading, refresh: load };
}

// ─── useEmployeeProjectDetailDB (project detail) ────────────────────────────

export function useEmployeeProjectDetailDB(projectId: string | undefined) {
  const { user, orgId } = useAuth();
  const [projectData, setProjectData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !orgId || !projectId) { setIsLoading(false); return; }
    setIsLoading(true);

    try {
      // Try internal project first
      const { data: proj } = await supabase
        .from('projects')
        .select('id, name, start_date, end_date, status')
        .eq('id', projectId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (proj) {
        // ── Internal project path ────────────────────────────────────────────
        const { data: tasks } = await supabase
          .from('tasks')
          .select(`
            id, name, status, due_date, estimated_hours, assignee_id, is_blocked,
            task_blockers ( id, blocker_description, blocking_user_name, resolved )
          `)
          .eq('project_id', projectId)
          .order('due_date', { ascending: true, nullsFirst: false });

        const allTasks: any[] = tasks || [];
        const myTasks = allTasks.filter((t: any) => t.assignee_id === user.id);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const doneList = myTasks.filter((t: any) => isDone(t.status));
        const doneHours = doneList.reduce((s: number, t: any) => s + (t.estimated_hours || 0), 0);
        const totalHours = myTasks.reduce((s: number, t: any) => s + (t.estimated_hours || 0), 0);
        const progress = myTasks.length > 0 ? Math.round((doneList.length / myTasks.length) * 100) : 0;
        const activeCount = myTasks.filter((t: any) => !isDone(t.status)).length;

        // Grouped tasks
        const groupedTasks: Record<string, any[]> = { overdue: [], urgent: [], this_week: [], later: [], completed: [] };
        myTasks.forEach((t: any) => {
          const activeBlockers = (t.task_blockers || []).filter((b: any) => !b.resolved);
          const enriched = { ...t, active_blockers: activeBlockers };
          if (isDone(t.status)) { groupedTasks.completed.push(enriched); return; }
          groupedTasks[urgencyGroup(t.due_date, today)].push(enriched);
        });

        // Team capacity
        const assigneeIds = [...new Set(allTasks.map((t: any) => t.assignee_id).filter(Boolean))];
        let usersMap: Record<string, any> = {};
        if (assigneeIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name, email, designation')
            .in('id', assigneeIds as string[]);
          (usersData || []).forEach((u: any) => { usersMap[u.id] = u; });
        }

        const teamMap: Record<string, any> = {};
        allTasks.forEach((t: any) => {
          const uid = t.assignee_id;
          if (!uid) return;
          if (!teamMap[uid]) {
            teamMap[uid] = { id: uid, name: usersMap[uid]?.name || 'Unknown', email: usersMap[uid]?.email || '', role: usersMap[uid]?.designation || '', tasks: [], allocated_hours: 0, done_hours: 0 };
          }
          teamMap[uid].tasks.push(t);
          teamMap[uid].allocated_hours += t.estimated_hours || 0;
          if (isDone(t.status)) teamMap[uid].done_hours += t.estimated_hours || 0;
        });

        const teamCapacity = Object.values(teamMap).map((m: any) => {
          const util = m.allocated_hours > 0 ? Math.round((m.done_hours / m.allocated_hours) * 100) : 0;
          const incomplete = m.tasks.filter((t: any) => !isDone(t.status));
          const urgentTasks = incomplete.filter((t: any) => t.due_date && differenceInDays(new Date(t.due_date), today) <= 3 && differenceInDays(new Date(t.due_date), today) >= 0);
          const overdueTasks = incomplete.filter((t: any) => t.due_date && new Date(t.due_date) < today);
          const nextTask = [...incomplete].sort((a: any, b: any) => {
            const aDate = a.due_date ? new Date(a.due_date).getTime() : 9e12;
            const bDate = b.due_date ? new Date(b.due_date).getTime() : 9e12;
            return aDate - bDate;
          })[0];
          const utilizationStatus = util < 50 ? 'under' : util >= 90 ? 'at-capacity' : 'on-track';
          const utilizationLabel = util < 50 ? 'Under capacity' : util >= 90 ? 'At capacity' : 'On track';
          return { ...m, task_count: m.tasks.length, urgent_count: urgentTasks.length, overdue_count: overdueTasks.length, next_task: nextTask, utilization: util, utilizationStatus, utilizationLabel, isYou: m.id === user.id };
        });

        // Timeline: tasks grouped by due week
        const weekMap: Record<string, any> = {};
        allTasks.forEach((t: any) => {
          if (!t.due_date) return;
          const due = new Date(t.due_date);
          const day = due.getDay();
          const mondayOffset = day === 0 ? -6 : 1 - day;
          const monday = new Date(due.getTime() + mondayOffset * 86400000);
          const key = monday.toISOString().split('T')[0];
          if (!weekMap[key]) {
            const friday = new Date(monday.getTime() + 4 * 86400000);
            const isCurrentWeek = Math.abs(differenceInDays(today, monday)) <= 6;
            weekMap[key] = { weekStart: key, label: `${format(monday, 'MMM d')} – ${format(friday, 'MMM d')}`, isCurrentWeek, tasks: [] };
          }
          weekMap[key].tasks.push({ ...t, assignee_name: usersMap[t.assignee_id]?.name || 'Unknown' });
        });
        const timeline = Object.values(weekMap).sort((a: any, b: any) => a.weekStart.localeCompare(b.weekStart));

        const startDate = proj.start_date ? new Date(proj.start_date) : new Date();
        const endDate = proj.end_date ? new Date(proj.end_date) : new Date(Date.now() + 30 * 86400000);
        const remainingDays = Math.max(0, differenceInDays(endDate, today));

        setProjectData({
          project: {
            name: proj.name,
            dates: `${format(startDate, 'MMM d, yyyy')} → ${format(endDate, 'MMM d, yyyy')} • ${remainingDays} days remaining`,
          },
          stats: [
            { label: 'Completion', value: `${progress}%` },
            { label: 'Active Tasks', value: `${activeCount}` },
            { label: 'Allocated', value: `${totalHours}h` },
            { label: 'Completed', value: `${doneHours}h` },
          ],
          overviewTasks: myTasks.slice(0, 5).map((t: any) => ({
            name: t.name,
            status: t.status || 'Not Started',
            progress: isDone(t.status) ? 100 : isInProgress(t.status) ? 50 : 0,
          })),
          myTasks: myTasks.map((t: any) => ({ ...t, active_blockers: (t.task_blockers || []).filter((b: any) => !b.resolved) })),
          groupedTasks,
          teamCapacity,
          timeline,
          myWork: { logged: doneHours, estimated: totalHours, percent: totalHours > 0 ? Math.min(100, Math.round((doneHours / totalHours) * 100)) : 0 },
          _isInternal: true,
        });
      } else {
        // ── Fallback: jira project ───────────────────────────────────────────
        const { data: jiraProj } = await supabase
          .from('jira_projects')
          .select('*')
          .eq('id', projectId)
          .single();

        if (!jiraProj) { setIsLoading(false); return; }

        const { data: issuesData } = await supabase
          .from('jira_issues')
          .select('*')
          .eq('jira_project_id', projectId);

        const issues: any[] = issuesData || [];
        const myIssues = issues.filter((i: any) => i.assignee_email === user.email);
        const actCount = issues.filter((i: any) => !isDone(i.status)).length;
        const totalEstSeconds = issues.reduce((s: number, i: any) => s + (i.original_estimate_seconds || 0), 0);
        const totalSpentSeconds = issues.reduce((s: number, i: any) => s + (i.time_spent_seconds || 0), 0);
        const totalHoursEstimated = Math.round(totalEstSeconds / 3600);
        const totalHoursLogged = Math.round(totalSpentSeconds / 3600);
        const progress = totalHoursEstimated > 0 ? Math.round((totalHoursLogged / totalHoursEstimated) * 100) : 0;
        const myEstSeconds = myIssues.reduce((s: number, i: any) => s + (i.original_estimate_seconds || 0), 0);
        const mySpentSeconds = myIssues.reduce((s: number, i: any) => s + (i.time_spent_seconds || 0), 0);
        const myLogged = Math.round(mySpentSeconds / 3600);
        const myEstimated = Math.round(myEstSeconds / 3600);
        const dueDates = issues.map((i: any) => i.due_date).filter(Boolean).map((d: string) => new Date(d).getTime());
        const createdMs = new Date(jiraProj.created_at || Date.now()).getTime();
        const maxDue = dueDates.length > 0 ? new Date(Math.max(...dueDates)) : new Date(Date.now() + 30 * 86400000);
        const remainingDays = Math.max(0, differenceInDays(maxDue, new Date()));

        setProjectData({
          project: {
            name: jiraProj.name || `Project ${jiraProj.project_key}`,
            dates: `${format(createdMs, 'MMM d, yyyy')} → ${format(maxDue, 'MMM d, yyyy')} • ${remainingDays} days remaining`,
          },
          stats: [
            { label: 'Completion', value: `${progress}%` },
            { label: 'Active Tasks', value: `${actCount}` },
            { label: 'Time Logged', value: `${totalHoursLogged}h` },
            { label: 'Est. Remaining', value: `${Math.max(0, totalHoursEstimated - totalHoursLogged)}h` },
          ],
          overviewTasks: myIssues.slice(0, 5).map((i: any) => ({
            name: i.summary || i.issue_key,
            status: i.status || 'To Do',
            progress: i.original_estimate_seconds > 0 ? Math.min(100, Math.round(((i.time_spent_seconds || 0) / i.original_estimate_seconds) * 100)) : (isDone(i.status) ? 100 : 0),
          })),
          myTasks: myIssues.map((i: any) => ({
            id: i.id,
            name: i.summary || i.issue_key,
            phase: 'Development',
            hours: `${Math.round((i.time_spent_seconds || 0) / 3600)}h / ${Math.round((i.original_estimate_seconds || 0) / 3600)}h`,
            status: i.status || 'To Do',
            progress: i.original_estimate_seconds > 0 ? Math.min(100, Math.round(((i.time_spent_seconds || 0) / i.original_estimate_seconds) * 100)) : (isDone(i.status) ? 100 : 0),
            checked: isDone(i.status),
            active_blockers: [],
            is_blocked: false,
          })),
          groupedTasks: null, // Jira issues don't support priority grouping
          teamCapacity: null,
          timeline: null,
          myWork: { logged: myLogged, estimated: Math.max(myEstimated, myLogged), percent: myEstimated > 0 ? Math.min(100, Math.round((myLogged / myEstimated) * 100)) : (myLogged > 0 ? 100 : 0) },
          _isInternal: false,
        });
      }
    } catch (err) {
      console.error('[useEmployeeProjectDetailDB] error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.email, orgId, projectId]);

  useEffect(() => { load(); }, [load]);

  return { projectData, isLoading, refresh: load };
}
