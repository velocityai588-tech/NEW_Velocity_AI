/**
 * Custom hook to handle leave management data fetching
 * Normalizes and caches data to prevent repeated fetches
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Task, LeaveRequest, EmployeeProfile } from '@/components/leave-management/types';

interface LeaveDataState {
  tasks: Task[];
  employees: EmployeeProfile[];
  leaves: LeaveRequest[];
  currentUser: string;
  currentOrgId: string | null;
  isLoading: boolean;
  error: string | null;
  dataSource: 'JIRA' | 'CSV';
  lastRefreshTime: number;
}

const CACHE_DURATION = 60000; // 1 minute

export function useLeaveManagementData() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<LeaveDataState>({
    tasks: [],
    employees: [],
    leaves: [],
    currentUser: 'Loading...',
    currentOrgId: null,
    isLoading: true,
    error: null,
    dataSource: 'CSV',
    lastRefreshTime: 0,
  });

  const fetchAbortController = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      fetchAbortController.current?.abort();
    };
  }, []);

  /**
   * Fetch leaves from Supabase
   */
  const fetchSupabaseLeaves = useCallback(async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, user_id, name, start_date, end_date, reason, status, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedLeaves: LeaveRequest[] = data.map((l: any) => {
          const normalizeStatus = (status: string): 'Pending' | 'Approved' | 'Rejected' | 'Shifted' => {
            if (!status) return 'Pending';
            const normalized = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
            if (['Pending', 'Approved', 'Rejected', 'Shifted'].includes(normalized)) {
              return normalized as 'Pending' | 'Approved' | 'Rejected' | 'Shifted';
            }
            return 'Pending';
          };

          return {
            id: l.id,
            org_id: orgId,
            user_id: l.user_id,
            name: l.name || 'Unknown Employee',
            startDate: l.start_date,
            endDate: l.end_date,
            reason: l.reason || '',
            status: normalizeStatus(l.status),
            history: [],
          };
        });

        return formattedLeaves;
      }
    } catch (err) {
      console.error('[LeaveData] Error fetching leaves:', err);
    }
    return [];
  }, []);

  /**
   * Fetch all data once on mount
   */
  useEffect(() => {
    if (authLoading || !isMountedRef.current) return;

    let mounted = true;
    
    const fetchAllData = async () => {
      // Prevent concurrent fetches
      fetchAbortController.current?.abort();
      fetchAbortController.current = new AbortController();

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        let orgId: string | null = null;
        let currentUserEmail = user?.email;
        let userId = user?.id;

        // Get user email and ID from auth
        if (!currentUserEmail || !userId) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          currentUserEmail = authUser?.email;
          userId = authUser?.id;
        }

        // SECURITY: Only allow access if user is a member of an organization
        // Use organization_members table (the source of truth) instead of users table
        if (!userId) {
          throw new Error('User not authenticated. Please log in again.');
        }

        const { data: membership, error: membershipError } = await supabase
          .from('organization_members')
          .select('org_id, organizations(name)')
          .eq('user_id', userId)
          .limit(1)
          .single();

        if (membershipError || !membership) {
          console.warn('[LeaveData] User is not a member of any organization:', userId);
          throw new Error('You are not a member of any organization. Please contact your administrator.');
        }

        orgId = membership.org_id;
        const orgName = (membership as any).organizations?.name || 'Your Organization';

        if (mounted) {
          setState(prev => ({ 
            ...prev, 
            currentUser: currentUserEmail || 'User',
            currentOrgId: orgId
          }));
        }

        if (!orgId) throw new Error('Unable to determine organization.');

        if (mounted) {
          setState(prev => ({ ...prev, currentOrgId: orgId }));
        }

        // Fetch in parallel
        const [issuesData, leaves] = await Promise.all([
          supabase
            .from('jira_issues')
            .select('*')
            .eq('org_id', orgId)
            .then(res => res.data),
          fetchSupabaseLeaves(orgId),
        ]);

        if (!mounted) return;

        if (issuesData && issuesData.length > 0) {
          const uniqueEmployees = new Map<string, EmployeeProfile>();
          const loadedTasks = issuesData.map((issue: any, index: number) => {
            const assignee = issue.assignee || 'Unassigned';
            const cleanCreated = issue.created_date?.split('T')[0] || new Date().toISOString().split('T')[0];
            const cleanDue = issue.due_date?.split('T')[0] || cleanCreated;

            if (assignee !== 'Unassigned' && !uniqueEmployees.has(assignee)) {
              uniqueEmployees.set(assignee, {
                name: assignee,
                role: issue.issue_type || 'Developer',
                skills: [issue.issue_type || 'Development'],
              });
            }

            return {
              id: issue.id || index,
              projectName: issue.project_name || issue.project_key || 'Unassigned',
              taskName: `${issue.issue_key}: ${issue.summary}`,
              assignee: assignee,
              hours: issue.original_estimate_seconds ? (issue.original_estimate_seconds / 3600) : 8,
              day: 0,
              requiredSkills: [issue.issue_type || 'Task'],
              isReallocated: false,
              isCancelled: ['closed', 'done', 'resolved'].includes(issue.status?.toLowerCase()),
              totalLogged: issue.time_spent_seconds ? (issue.time_spent_seconds / 3600) : 0,
              logs: [],
              created_date: cleanCreated,
              due_date: cleanDue,
            };
          });

          setState(prev => ({
            ...prev,
            tasks: loadedTasks,
            employees: Array.from(uniqueEmployees.values()),
            leaves,
            dataSource: 'JIRA',
            isLoading: false,
            lastRefreshTime: Date.now(),
          }));
        } else {
          setState(prev => ({
            ...prev,
            tasks: [],
            employees: [],
            leaves,
            dataSource: 'CSV',
            isLoading: false,
            lastRefreshTime: Date.now(),
          }));
        }
      } catch (error) {
        console.error('[LeaveData] Load Error:', error);
        if (mounted) {
          setState(prev => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Unknown error',
            isLoading: false,
          }));
        }
      }
    };

    fetchAllData();
    return () => {
      mounted = false;
    };
  }, [user, authLoading, fetchSupabaseLeaves]);

  /**
   * Refresh only leaves (without refetching all tasks)
   */
  const refreshLeaves = useCallback(async () => {
    if (!state.currentOrgId) return;
    
    const leaves = await fetchSupabaseLeaves(state.currentOrgId);
    setState(prev => ({ ...prev, leaves, lastRefreshTime: Date.now() }));
  }, [state.currentOrgId, fetchSupabaseLeaves]);

  /**
   * Add a new leave request
   */
  const addLeaveRequest = useCallback(async (request: Omit<LeaveRequest, 'id' | 'status'>) => {
    if (!state.currentOrgId) throw new Error('Organization not found');

    const employeeName = (request as any).employeeName || request.name;
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate || request.startDate);

    const formatDateAsString = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const normalizedStartDate = formatDateAsString(startDate);
    const normalizedEndDate = formatDateAsString(endDate);

    const generateUserIdFromName = (name: string): string => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        const char = name.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
      return `00000000-0000-4000-a000-${hashStr}00000000`.substring(0, 36);
    };

    const payload = {
      org_id: state.currentOrgId,
      user_id: generateUserIdFromName(employeeName),
      name: employeeName,
      start_date: normalizedStartDate,
      end_date: normalizedEndDate,
      reason: request.reason || 'Not specified',
      status: 'pending',
    };

    const { error } = await supabase.from('leave_requests').insert([payload]);
    if (error) throw error;

    // Refresh leaves after adding
    await refreshLeaves();
  }, [state.currentOrgId, refreshLeaves]);

  return {
    ...state,
    refreshLeaves,
    addLeaveRequest,
  };
}
