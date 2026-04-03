import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Task, 
  LeaveRequest, 
  EmployeeProfile, 
  LeaveBalance 
} from '@/components/leave-management/types';

interface LeaveDataState {
  tasks: Task[];
  employees: EmployeeProfile[];
  leaves: LeaveRequest[];
  balances: LeaveBalance[];
  leaveTypes: any[]; // NEW
  currentUser: EmployeeProfile | null;
  currentOrgId: string | null;
  isLoading: boolean;
  error: string | null;
  lastRefreshTime: number;
}

export function useLeaveManagementData() {
  const { user, loading: authLoading, activeTeamId } = useAuth();
  const [state, setState] = useState<LeaveDataState>({
    tasks: [],
    employees: [],
    leaves: [],
    balances: [],
    leaveTypes: [], // NEW
    currentUser: null,
    currentOrgId: null,
    isLoading: true,
    error: null,
    lastRefreshTime: 0,
  });

  /**
   * Core Fetch Function
   * Strictly pulls from Supabase tables based on authenticated organization_id
   */
  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // 1. Get the current user's profile and organization context
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, organization_id, email, name, role, capacity_hours_per_week, is_active')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        throw new Error("User record not found in database. Ensure the user exists in the 'users' table.");
      }

      const orgId = userData.organization_id;

      // 2. Fetch Projects scoped to the active team
      let projectsQuery = supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', orgId);
      
      if (activeTeamId) {
        projectsQuery = projectsQuery.eq('team_id', activeTeamId);
      }

      const { data: projects, error: projectsError } = await projectsQuery;

      if (projectsError) throw projectsError;
      const projectIds = projects?.map(p => p.id) || [];

      // 3. Execute parallel queries for remaining module data
      const leavesQuery = supabase
        .from('leave_requests')
        .select(`
          id, organization_id, user_id, leave_type_id, start_date, end_date, reason, status,
          users!inner ( 
            name,
            team_members!inner ( team_id )
          ),
          leave_types ( name )
        `)
        .eq('organization_id', orgId);

      if (activeTeamId) {
        leavesQuery.eq('users.team_members.team_id', activeTeamId);
      }

      const employeesQuery = supabase
        .from('users')
        .select(`
          id, organization_id, email, name, role, capacity_hours_per_week, is_active,
          team_members!inner ( team_id )
        `)
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (activeTeamId) {
        employeesQuery.eq('team_members.team_id', activeTeamId);
      }

      const [leavesRes, balancesRes, tasksRes, employeesRes, leaveTypesRes] = await Promise.all([
        leavesQuery.order('created_at', { ascending: false }),

        // Fetch Leave Balances for the current user
        supabase
          .from('employee_leave_balances')
          .select(`
            *,
            leave_types ( name, annual_quota )
          `)
          .eq('user_id', userData.id),

        // Fetch Tasks linked to the organization's projects
        supabase
          .from('tasks')
          .select('*')
          .in('project_id', projectIds),

        employeesQuery,

        // Fetch ALL Leave Types for the organization to populate dropdowns
        supabase
          .from('leave_types')
          .select('*')
          .eq('organization_id', orgId)
      ]);

      // Check for query errors
      if (leavesRes.error) throw leavesRes.error;
      if (balancesRes.error) throw balancesRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (leaveTypesRes.error) throw leaveTypesRes.error;

      // 4. Data Transformation / Mapping to Frontend Types
      const formattedLeaves: LeaveRequest[] = (leavesRes.data || []).map((l: any) => ({
        id: l.id,
        organization_id: l.organization_id,
        user_id: l.user_id,
        leave_type_id: l.leave_type_id,
        name: l.users?.name || 'Unknown User',
        startDate: l.start_date,
        endDate: l.end_date,
        reason: l.reason || '',
        status: l.status,
        leave_type_name: l.leave_types?.name || 'Unspecified'
      }));

      const formattedTasks: Task[] = (tasksRes.data || []).map((task: any) => {
        const project = projects?.find(p => p.id === task.project_id);
        const assigneeUser = employeesRes.data?.find(u => u.id === task.assignee_id || u.id === task.user_id);
        
        return {
          id: task.id,
          projectName: project?.name || 'Unknown Project',
          taskName: task.name,
          assignee: assigneeUser?.email || 'Unassigned',
          assigneeName: assigneeUser?.name, // NEW
          hours: Number(task.estimated_hours || 0),
          status: task.status || 'not_started',
          created_date: task.start_date || task.created_at, // Use scheduled start_date for proper shifting
          due_date: task.due_date
        };
      });

      // 5. Update State
      setState({
        tasks: formattedTasks,
        employees: employeesRes.data || [],
        leaves: formattedLeaves,
        balances: balancesRes.data || [],
        leaveTypes: leaveTypesRes.data || [],
        currentUser: userData as EmployeeProfile,
        currentOrgId: orgId,
        isLoading: false,
        error: null,
        lastRefreshTime: Date.now(),
      });

    } catch (err: any) {
      console.error('[LeaveManagementData Hook Error]:', err.message);
      setState(prev => ({ 
        ...prev, 
        error: err.message, 
        isLoading: false 
      }));
    }
  }, [user, activeTeamId]);

  // Initial load when auth is ready
  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  /**
   * Action: Add Leave Request
   * Strictly uses active session IDs
   */
  const addLeaveRequest = useCallback(async (request: {
    startDate: string;
    endDate: string;
    reason: string;
    leave_type_id: string;
    user_id?: string; // NEW: Allow manager selection
    customLeaveType?: string; // NEW: On-the-fly type creation
  }) => {
    if (!state.currentOrgId) {
      throw new Error("Active organization session required.");
    }

    let finalLeaveTypeId = request.leave_type_id;

    // 1. Create custom leave type if specified
    if (request.customLeaveType && request.customLeaveType.trim() !== '') {
      const { data: newType, error: typeError } = await supabase
        .from('leave_types')
        .insert([{
          organization_id: state.currentOrgId,
          name: request.customLeaveType.trim()
        }])
        .select('id')
        .single();

      if (typeError) throw typeError;
      if (newType) finalLeaveTypeId = newType.id;
    }

    const targetUserId = request.user_id || state.currentUser?.id;
    if (!targetUserId) throw new Error("Target user ID is missing.");

    // 2. Insert Leave Request
    const { error } = await supabase.from('leave_requests').insert([{
      organization_id: state.currentOrgId,
      user_id: targetUserId,
      leave_type_id: finalLeaveTypeId,
      start_date: request.startDate,
      end_date: request.endDate,
      reason: request.reason,
      status: 'pending' // Forced default for new requests
    }]);

    if (error) throw error;
    
    // Refresh full state to reflect new request and updated 'pending' balance
    await fetchData();
  }, [state.currentOrgId, state.currentUser, fetchData]);

  /**
   * Action: Update Leave Request Status (Manager Side)
   */
  const updateLeaveStatus = useCallback(async (leaveId: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status })
      .eq('id', leaveId);

    if (error) throw error;
    
    // Refresh to reflect the change
    await fetchData();
  }, [fetchData]);

  return { 
    ...state, 
    refresh: fetchData, 
    addLeaveRequest,
    updateLeaveStatus 
  };
}