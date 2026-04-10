import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { VelocityAISidebar } from '@/components/dashboard/VelocityAISidebar';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Loader2, Calendar, Users, BarChart3, Briefcase } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjects } from '@/hooks/useProjects'; // <--- NEW HOOK
import { ProjectsEmptyState } from './ProjectsEmptyState';
import { getCurrentOrgId } from '@/lib/orgContext';
import { IngestionControl } from './IngestionControl';

export default function Projects() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  // 1. Use the unified hook instead of manual Supabase calls
  const { projects, isLoading, fetchProjects } = useProjects();
  
  // 2. Local search state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [hasFetched, setHasFetched] = React.useState(false);

  // 3. Fetch on mount (Strictly linked to Org ID) - only once and not while hidden
  useEffect(() => {
    if (hasFetched || authLoading || !user || document.hidden) {
      return; // Skip if already fetched, still loading, no user, or page is hidden
    }
    
    const orgId = getCurrentOrgId();
    if (orgId) {
      setHasFetched(true);
      fetchProjects(orgId);
    }
  }, [user, authLoading]); // Remove fetchProjects from dependencies

  // 4. Client-side filtering
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const lowerQuery = searchQuery.toLowerCase();
    return projects.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description?.toLowerCase().includes(lowerQuery)
    );
  }, [projects, searchQuery]);

  return (
    <VelocityAISidebar>
      <div className="bg-[#FAFAF9] min-h-screen p-8 md:p-12">
        <div className="max-w-[1600px] mx-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-2xl font-medium text-[#1C1917]">All Projects</h2>
              <p className="text-[#78716C] text-sm mt-1">{filteredProjects.length} Active Workspaces</p>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => fetchProjects(getCurrentOrgId())} 
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button 
                onClick={() => navigate('/projects/create')} 
                className="bg-[#1C1917] text-white gap-2"
              >
                <Plus className="w-4 h-4" /> New Project
              </Button>
            </div>
          </div>

          {/* Ingestion Control */}
          <div className="mb-8">
            <IngestionControl projectId={filteredProjects[0]?.id || null} userId={user?.id || ''} />
          </div>

          {/* Project List */}
          <div className="bg-white rounded-3xl border border-[#E7E5E4] overflow-hidden min-h-[400px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[#1C1917]" />
                <p className="mt-4 text-[#A8A29E]">Syncing workspaces...</p>
              </div>
            ) : filteredProjects.length > 0 ? (
              <div className="divide-y divide-[#F5F5F4]">
                {filteredProjects.map(project => (
                  <div
                    key={project.id}
                    className="p-6 hover:bg-[#FAFAF9] cursor-pointer transition-all duration-200 group relative hover:shadow-[inset_0_0_0_1px_rgba(45,212,191,0.15)]"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        {/* Title & Source Badge */}
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-[#1C1917] text-lg">{project.name}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            project.source === 'jira' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {project.source || 'Internal'}
                          </span>
                        </div>

                        <p className="text-sm text-[#78716C] mt-1 max-w-2xl line-clamp-1">
                          {project.description || 'No description provided.'}
                        </p>

                        {/* Meta Data */}
                        <div className="flex items-center gap-6 mt-4 text-xs text-[#A8A29E]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(project.created_at).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5" />
                            {project.team_name || 'Unassigned Team'}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5" />
                            {project.task_count || 0} Tasks
                          </div>
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <div className="flex flex-col items-end gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                          project.status === 'active'
                            ? 'bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]'
                            : 'bg-[#f9fafb] text-[#6b7280] border border-[#e5e7eb]'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${project.status === 'active' ? 'bg-[#22c55e]' : 'bg-[#9ca3af]'}`} />
                          {project.status || 'inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ProjectsEmptyState
                onCreateProject={() => navigate('/projects/create')}
                onPlanWithAI={() => navigate('/plan')}
              />
            )}
          </div>
        </div>
      </div>
    </VelocityAISidebar>
  );
}