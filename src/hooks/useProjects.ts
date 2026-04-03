import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Project, DraftProjectState } from '@/components/projects/types';
import { toast } from 'sonner';
import { setupProgressService } from '@/services/setupProgressService';

export function useProjects() {
  const { user, activeTeamId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // 1. Fetch Projects List
  const fetchProjects = useCallback(async (orgId: string, teamId?: string | null) => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('projects')
        .select(`
          *,
          teams ( name ),
          tasks ( id )
        `)
        .eq('organization_id', orgId);

      // Filter by team if provided or active
      const targetTeamId = teamId !== undefined ? teamId : activeTeamId;
      if (targetTeamId) {
        query = query.eq('team_id', targetTeamId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      setProjects(data.map((p: any) => ({
        ...p,
        team_name: p.teams?.name,
        task_count: p.tasks?.length || 0
      })));
    } catch (err: any) {
      toast.error('Failed to load projects: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Commit Logic: The "Auto-Magic" Button
  const commitProject = useCallback(async (
    orgId: string,
    draft: DraftProjectState
  ) => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Step A: Create a Team for this project
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert([{
          organization_id: orgId,
          name: draft.name
        }])
        .select()
        .single();

      if (teamError) throw teamError;

      // Step B: Add Members to the Team
      if (draft.selectedTeamIds.length > 0) {
        const teamMembers = draft.selectedTeamIds.map(userId => ({
          team_id: teamData.id,
          user_id: userId,
          role: 'member'
        }));

        const { error: memberError } = await supabase
          .from('team_members')
          .insert(teamMembers);

        if (memberError) throw memberError;
      }

      // Step C: Create the Project
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert([{
          organization_id: orgId,
          team_id: teamData.id,
          name: draft.name,
          description: draft.description,
          status: 'active',
          source: 'internal',
          start_date: new Date().toISOString()
        }])
        .select()
        .single();

      if (projectError) throw projectError;

      // Step D: Create Tasks
      const tasksPayload = draft.tasks.map(t => ({
        project_id: projectData.id,
        name: t.task,
        estimated_hours: t.estimatedHours,
        status: 'not_started',
        start_date: t.startDate ? t.startDate.toISOString().split('T')[0] : null,
        due_date: t.dueDate ? t.dueDate.toISOString().split('T')[0] : null,
        assignee_id: t.assigneeId || null,
      }));

      const { error: tasksError } = await supabase
        .from('tasks')
        .insert(tasksPayload);

      if (tasksError) throw tasksError;

      toast.success('Project created successfully!');
      setupProgressService.markStepComplete(orgId, 'first_project_created');
      return projectData.id; // Return ID to navigate to details

    } catch (err: any) {
      console.error(err);
      toast.error('Failed to commit project: ' + err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return {
    isLoading,
    projects,
    fetchProjects,
    commitProject
  };
}