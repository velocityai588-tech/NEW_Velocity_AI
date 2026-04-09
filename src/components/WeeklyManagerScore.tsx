import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { useAuth } from '@/contexts/AuthContext';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ScoreDimension {
  label: string;
  score: number;
  max: number;
  note: string;
}

export const WeeklyManagerScore: React.FC = () => {
  const { user } = useAuth();
  const [dimensions, setDimensions] = useState<ScoreDimension[]>([]);
  const [total, setTotal] = useState(0);
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(true);
  const [weekOf, setWeekOf] = useState('');

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;
      try {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        setWeekOf(weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

        const [tasksRes, leaveRes, suggestionsRes, projectsRes] = await Promise.all([
          supabase.from('tasks').select('id, status').eq('project_id', orgId).gte('created_at', weekAgo),
          supabase.from('leave_requests').select('id, status').eq('organization_id', orgId),
          supabase.from('ai_task_suggestions').select('id, status').gte('created_at', weekAgo),
          supabase.from('projects').select('id, status').eq('organization_id', orgId).eq('status', 'active'),
        ]);

        const tasks = tasksRes.data || [];
        const leaves = leaveRes.data || [];
        const suggestions = suggestionsRes.data || [];
        const projects = projectsRes.data || [];

        // Dimension 1: Sprint health (tasks completed this week)
        const completedTasks = tasks.filter(t => ['done', 'completed'].includes(t.status?.toLowerCase())).length;
        const sprintScore = tasks.length > 0 ? Math.min(25, Math.round((completedTasks / tasks.length) * 25)) : 15;
        const sprintNote = `${completedTasks}/${tasks.length} tasks completed`;

        // Dimension 2: Team utilization (based on active projects)
        const utilScore = Math.min(25, projects.length * 5 + 10);
        const utilNote = `${projects.length} active projects`;

        // Dimension 3: Leave coverage (pending leave approvals)
        const pendingLeave = leaves.filter(l => l.status === 'pending').length;
        const leaveScore = Math.max(0, 25 - pendingLeave * 5);
        const leaveNote = pendingLeave > 0 ? `${pendingLeave} leave requests pending` : 'All leave handled';

        // Dimension 4: AI adoption (approved suggestions)
        const approvedSugg = suggestions.filter(s => s.status === 'approved').length;
        const aiScore = Math.min(25, approvedSugg * 5 + (suggestions.length > 0 ? 10 : 5));
        const aiNote = `${approvedSugg} AI suggestions approved`;

        const dims: ScoreDimension[] = [
          { label: 'Sprint Health', score: sprintScore, max: 25, note: sprintNote },
          { label: 'Team Utilization', score: utilScore, max: 25, note: utilNote },
          { label: 'Leave Coverage', score: leaveScore, max: 25, note: leaveNote },
          { label: 'AI Adoption', score: aiScore, max: 25, note: aiNote },
        ];

        const tot = dims.reduce((s, d) => s + d.score, 0);
        setDimensions(dims);
        setTotal(tot);
        setGrade(tot >= 90 ? 'A+' : tot >= 80 ? 'A' : tot >= 70 ? 'B' : tot >= 60 ? 'C' : 'D');
      } catch (e) {
        console.error('WeeklyManagerScore error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return null;

  const gradeColor = grade.startsWith('A') ? 'text-teal-600' : grade === 'B' ? 'text-blue-600' : grade === 'C' ? 'text-amber-600' : 'text-red-600';
  const gradeBg = grade.startsWith('A') ? 'bg-teal-50 border-teal-200' : grade === 'B' ? 'bg-blue-50 border-blue-200' : grade === 'C' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-900">Weekly Manager Score</h3>
        </div>
        <span className="text-xs text-gray-400">Week of {weekOf}</span>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-5 mb-5">
          <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center flex-shrink-0 ${gradeBg}`}>
            <span className={`text-2xl font-light ${gradeColor}`}>{grade}</span>
          </div>
          <div>
            <p className="text-3xl font-light text-gray-900">{total}<span className="text-sm text-gray-400">/100</span></p>
            <p className="text-xs text-gray-400 mt-0.5">
              {total >= 80 ? 'Great week — keep it up' : total >= 60 ? 'Good progress this week' : 'Room to improve — check pending items'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {dimensions.map(d => (
            <div key={d.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{d.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-700">{d.score}/{d.max}</span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    d.score / d.max >= 0.8 ? 'bg-teal-400' : d.score / d.max >= 0.6 ? 'bg-blue-400' : d.score / d.max >= 0.4 ? 'bg-amber-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${(d.score / d.max) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{d.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
