import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { AlertTriangle, CheckCircle2, Loader2, Zap } from 'lucide-react';

interface ComplexityResult {
  score: number;
  label: string;
  factors: { name: string; score: number; note: string }[];
  recommendation: string;
}

export const ProjectComplexityScore: React.FC = () => {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [result, setResult] = useState<ComplexityResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .limit(20);
      setProjects(data || []);
    };
    load();
  }, []);

  const handleScore = async () => {
    if (!selectedId) return;
    setLoading(true);
    setResult(null);
    try {
      const orgId = getCurrentOrgId();

      const [tasksRes, membersRes, projectRes] = await Promise.all([
        supabase.from('tasks').select('id, name, status, estimated_hours, assignee_id').eq('project_id', selectedId),
        supabase.from('team_members').select('user_id, users(name, capacity_hours_per_week)').eq('team_id', selectedId),
        supabase.from('projects').select('name, start_date, end_date').eq('id', selectedId).single(),
      ]);

      const tasks = tasksRes.data || [];
      const members = membersRes.data || [];
      const project = projectRes.data;

      // Factor 1: Task count / scope
      const taskCount = tasks.length;
      const scopeScore = Math.min(10, Math.round((taskCount / 5)));
      const scopeNote = `${taskCount} tasks — ${taskCount > 20 ? 'very large scope' : taskCount > 10 ? 'medium scope' : 'small scope'}`;

      // Factor 2: Timeline tightness
      let timelineScore = 5;
      let timelineNote = 'No end date set';
      if (project?.start_date && project?.end_date) {
        const days = Math.floor(
          (new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) / 86400000
        );
        const hoursNeeded = tasks.reduce((s, t) => s + (t.estimated_hours || 8), 0);
        const hoursAvailable = days * (members.length || 1) * 8;
        const ratio = hoursNeeded / Math.max(1, hoursAvailable);
        timelineScore = Math.min(10, Math.round(ratio * 10));
        timelineNote = `${days} days, ${Math.round(hoursNeeded)}h needed vs ${Math.round(hoursAvailable)}h available`;
      }

      // Factor 3: Team size vs scope
      const teamScore = members.length < 2 ? 8 : members.length < 4 ? 5 : 3;
      const teamNote = `${members.length || 'No'} team members assigned`;

      // Factor 4: Unassigned tasks
      const unassigned = tasks.filter(t => !t.assignee_id).length;
      const assignScore = tasks.length > 0 ? Math.round((unassigned / tasks.length) * 10) : 5;
      const assignNote = `${unassigned}/${taskCount} tasks unassigned`;

      const factors = [
        { name: 'Scope', score: scopeScore, note: scopeNote },
        { name: 'Timeline', score: timelineScore, note: timelineNote },
        { name: 'Team coverage', score: teamScore, note: teamNote },
        { name: 'Task assignment', score: assignScore, note: assignNote },
      ];

      const overall = Math.round(factors.reduce((s, f) => s + f.score, 0) / factors.length);
      const label = overall >= 8 ? 'High Risk' : overall >= 5 ? 'Medium Complexity' : 'Low Complexity';

      const recommendation =
        overall >= 8
          ? 'This project is high risk. Assign all tasks before starting and consider extending the timeline.'
          : overall >= 5
          ? 'Moderate complexity. Ensure team capacity is confirmed and key tasks are assigned.'
          : 'Low complexity. Team is well-positioned to deliver this project on time.';

      setResult({ score: overall, label, factors, recommendation });
    } catch (e) {
      console.error('ProjectComplexityScore error:', e);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 8 ? 'text-red-600' : s >= 5 ? 'text-amber-600' : 'text-teal-600';

  const scoreBg = (s: number) =>
    s >= 8 ? 'bg-red-50 border-red-200' : s >= 5 ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-medium text-gray-900">Project Complexity Score</h3>
        <span className="text-xs text-gray-400 ml-1">— catch risky projects before they start</span>
      </div>

      <div className="p-5 space-y-3">
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setResult(null); }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700"
          >
            <option value="">Select a project…</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={handleScore}
            disabled={loading || !selectedId}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? '…' : 'Score'}
          </button>
        </div>

        {result && (
          <div className="space-y-3">
            {/* Overall score */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${scoreBg(result.score)}`}>
              <div>
                <p className={`text-2xl font-light ${scoreColor(result.score)}`}>{result.score}<span className="text-sm">/10</span></p>
                <p className={`text-sm font-medium ${scoreColor(result.score)}`}>{result.label}</p>
              </div>
              <p className="text-xs text-gray-600 max-w-[60%] text-right">{result.recommendation}</p>
            </div>

            {/* Factor breakdown */}
            <div className="space-y-2">
              {result.factors.map(f => (
                <div key={f.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 flex-shrink-0">{f.name}</span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${f.score >= 8 ? 'bg-red-400' : f.score >= 5 ? 'bg-amber-400' : 'bg-teal-400'}`}
                      style={{ width: `${f.score * 10}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium w-6 ${scoreColor(f.score)}`}>{f.score}</span>
                  <span className="text-xs text-gray-400 truncate max-w-[160px]">{f.note}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
