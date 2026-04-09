import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { Zap, CheckCircle2, AlertTriangle, Users, Calendar, Brain } from 'lucide-react';

interface ChangelogEntry {
  id: string;
  type: 'task_extracted' | 'suggestion_approved' | 'project_flagged' | 'leave_approved' | 'rebalance' | 'allocation';
  message: string;
  time: string;
}

const TYPE_CONFIG = {
  task_extracted: { icon: Brain, color: 'text-violet-600', bg: 'bg-violet-50' },
  suggestion_approved: { icon: CheckCircle2, color: 'text-teal-600', bg: 'bg-teal-50' },
  project_flagged: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  leave_approved: { icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
  rebalance: { icon: Users, color: 'text-primary', bg: 'bg-gray-100' },
  allocation: { icon: Zap, color: 'text-teal-600', bg: 'bg-teal-50' },
};

export const AIChangelog: React.FC = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;
      try {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

        const [suggestionsRes, leaveRes, projectsRes, mlEventsRes] = await Promise.all([
          supabase
            .from('ai_task_suggestions')
            .select('id, task_name, status, created_at')
            .gte('created_at', weekAgo)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('leave_requests')
            .select('id, status, updated_at, users(name)')
            .eq('organization_id', orgId)
            .in('status', ['approved', 'rejected'])
            .gte('updated_at', weekAgo)
            .limit(5),
          supabase
            .from('projects')
            .select('id, name, status, updated_at')
            .eq('organization_id', orgId)
            .gte('updated_at', weekAgo)
            .limit(5),
          supabase
            .from('ml_training_events')
            .select('id, approved, created_at')
            .eq('org_id', orgId)
            .gte('created_at', weekAgo)
            .limit(10),
        ]);

        const log: ChangelogEntry[] = [];

        // AI task suggestions
        const suggestions = suggestionsRes.data || [];
        const extracted = suggestions.length;
        const approved = suggestions.filter(s => s.status === 'approved').length;
        if (extracted > 0) {
          log.push({
            id: 'extracted',
            type: 'task_extracted',
            message: `Extracted ${extracted} task${extracted !== 1 ? 's' : ''} from recent meetings`,
            time: suggestions[0]?.created_at || '',
          });
        }
        if (approved > 0) {
          log.push({
            id: 'approved',
            type: 'suggestion_approved',
            message: `${approved} AI suggestion${approved !== 1 ? 's' : ''} approved by managers`,
            time: suggestions[0]?.created_at || '',
          });
        }

        // Leave approvals
        (leaveRes.data || []).forEach(l => {
          log.push({
            id: l.id,
            type: 'leave_approved',
            message: `${l.status === 'approved' ? 'Approved' : 'Declined'} leave request for ${(l as any).users?.name || 'team member'}`,
            time: l.updated_at,
          });
        });

        // ML training events
        const mlEvents = mlEventsRes.data || [];
        const mlApproved = mlEvents.filter(e => e.approved).length;
        const mlRejected = mlEvents.filter(e => !e.approved).length;
        if (mlEvents.length > 0) {
          log.push({
            id: 'ml',
            type: 'allocation',
            message: `AI model trained on ${mlApproved} approval${mlApproved !== 1 ? 's' : ''} and ${mlRejected} rejection${mlRejected !== 1 ? 's' : ''} — allocations improving`,
            time: mlEvents[0]?.created_at || '',
          });
        }

        // Sort by time desc
        log.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setEntries(log.slice(0, 8));
      } catch (e) {
        console.error('AIChangelog error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || entries.length === 0) return null;

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <Zap className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-gray-900">AI Changelog</h3>
        <span className="text-xs text-gray-400 ml-1">— everything the AI did this week</span>
      </div>

      <div className="divide-y divide-gray-50">
        {entries.map(entry => {
          const config = TYPE_CONFIG[entry.type];
          const Icon = config.icon;
          return (
            <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
              <div className={`w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">{entry.message}</p>
                {entry.time && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(entry.time)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
