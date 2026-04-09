import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { Zap, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export const SprintRetroGenerator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [retro, setRetro] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', orgId)
        .in('status', ['active', 'completed'])
        .limit(20);
      setProjects(data || []);
    };
    load();
  }, []);

  const handleGenerate = async () => {
    if (!selectedProjectId) return toast.error('Select a project first');
    setLoading(true);
    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const [tasksRes, projectRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('name, status, estimated_hours, actual_hours, assignee_id, created_at, updated_at, users(name)')
          .eq('project_id', selectedProjectId),
        supabase
          .from('projects')
          .select('name, end_date, created_at')
          .eq('id', selectedProjectId)
          .single(),
      ]);

      const tasks = tasksRes.data || [];
      const project = projectRes.data;
      const completed = tasks.filter(t =>
        ['done', 'completed'].some(s => t.status?.toLowerCase().includes(s))
      );
      const incomplete = tasks.filter(
        t => !['done', 'completed'].some(s => t.status?.toLowerCase().includes(s))
      );

      // Member stats
      const memberStats: Record<string, { name: string; done: number; total: number; hours: number }> = {};
      tasks.forEach((t: any) => {
        if (!t.assignee_id) return;
        if (!memberStats[t.assignee_id])
          memberStats[t.assignee_id] = { name: t.users?.name || 'Unknown', done: 0, total: 0, hours: 0 };
        memberStats[t.assignee_id].total++;
        memberStats[t.assignee_id].hours += t.estimated_hours || 0;
        if (['done', 'completed'].some(s => t.status?.toLowerCase().includes(s)))
          memberStats[t.assignee_id].done++;
      });

      const totalEst = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
      const totalActual = tasks.reduce((s, t) => s + ((t as any).actual_hours || 0), 0);
      const velocity = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

      const overdelivered = Object.values(memberStats)
        .filter(m => m.total > 0 && m.done / m.total >= 0.9)
        .map(m => m.name);
      const underdelivered = Object.values(memberStats)
        .filter(m => m.total > 0 && m.done / m.total < 0.5)
        .map(m => m.name);

      const context = `Sprint: ${project?.name}
Velocity: ${velocity}% (${completed.length}/${tasks.length} tasks completed)
Estimated: ${totalEst}h${totalActual > 0 ? `, Actual: ${totalActual}h` : ''}
Overdelivered: ${overdelivered.join(', ') || 'None'}
Underdelivered: ${underdelivered.join(', ') || 'None'}
Blockers (incomplete): ${incomplete.slice(0, 3).map((t: any) => t.name).join(', ') || 'None'}
Team: ${Object.values(memberStats).map(m => `${m.name} (${m.done}/${m.total})`).join(', ')}`;

      const res = await fetch('/api/ai/expand-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Sprint retrospective',
          description: `Generate a concise sprint retrospective report:\n${context}\n\nFormat with these sections:\n## Velocity Summary\n## Who Overdelivered\n## What Got Blocked\n## Top 3 Recommendations for Next Sprint\n\nBe specific and direct. Ready to share with the team.`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRetro(data.description || '');
      }
    } catch (e) {
      toast.error('Failed to generate retrospective');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!retro) return;
    navigator.clipboard.writeText(retro).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-gray-900">Sprint Retrospective</h3>
        <span className="text-xs text-gray-400 ml-1">— one click, ready to share</span>
      </div>

      <div className="p-5 space-y-3">
        <select
          value={selectedProjectId}
          onChange={e => { setSelectedProjectId(e.target.value); setRetro(null); }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700"
        >
          <option value="">Select a project / sprint…</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {!retro ? (
          <button
            onClick={handleGenerate}
            disabled={loading || !selectedProjectId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 w-full justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? 'Generating…' : '✦ Generate Sprint Retro'}
          </button>
        ) : (
          <div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-3 max-h-64 overflow-y-auto">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{retro}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => { setRetro(null); setSelectedProjectId(''); }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                New retro
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
