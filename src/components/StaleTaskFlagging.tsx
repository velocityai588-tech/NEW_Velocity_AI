import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { Clock, CheckCircle2, X, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface StaleTask {
  id: string;
  name: string;
  assigneeName: string;
  daysSinceCreate: number;
  status: string;
}

export const StaleTaskFlagging: React.FC = () => {
  const [tasks, setTasks] = useState<StaleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const orgId = getCurrentOrgId();
    if (!orgId) { setLoading(false); return; }
    try {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data, error } = await supabase
        .from('tasks')
        .select('id, name, status, created_at, assignee_id')
        .lt('created_at', fourteenDaysAgo.toISOString())
        .not('assignee_id', 'is', null)
        .not('status', 'in', '("completed","done","closed")')
        .limit(8);

      if (error) { console.error('StaleTaskFlagging error:', error.message); return; }

      if (data) {
        setTasks(data.map((t: any) => ({
          id: t.id,
          name: t.name || 'Unnamed task',
          assigneeName: "Team member",
          daysSinceCreate: Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000),
          status: t.status,
        })));
      }
    } catch (e) {
      console.error('StaleTaskFlagging error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkActive = async (task: StaleTask) => {
    setActioning(task.id);
    try {
      await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
      toast.success(`"${task.name}" marked as active`);
      setDismissed(prev => new Set([...prev, task.id]));
    } catch {
      toast.error('Failed to update task');
    } finally {
      setActioning(null);
    }
  };

  const handleClose = async (task: StaleTask) => {
    setActioning(task.id);
    try {
      await supabase.from('tasks').update({ status: 'completed' }).eq('id', task.id);
      toast.success(`"${task.name}" closed`);
      setDismissed(prev => new Set([...prev, task.id]));
    } catch {
      toast.error('Failed to close task');
    } finally {
      setActioning(null);
    }
  };

  const visible = tasks.filter(t => !dismissed.has(t.id));
  if (loading || visible.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-medium text-gray-900">Stale Tasks</h3>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {visible.length} inactive 14+ days
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">Keep your board clean — mark active or close</p>
        </div>
        <button onClick={load} className="text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="divide-y divide-gray-50">
        {visible.map(task => (
          <div key={task.id} className="px-5 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {task.assigneeName} · <span className="text-amber-600 font-medium">{task.daysSinceCreate} days old</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {actioning === task.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : (
                <>
                  <button
                    onClick={() => handleMarkActive(task)}
                    className="flex items-center gap-1 text-xs font-medium text-[#0F766E] bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1.5 rounded-lg transition-all"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Still active
                  </button>
                  <button
                    onClick={() => handleClose(task)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-2.5 py-1.5 rounded-lg transition-all"
                  >
                    <X className="w-3 h-3" />
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
