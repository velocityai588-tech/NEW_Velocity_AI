// src/components/meetings/MeetingTranscripts.tsx
// Shows all meeting transcripts with action items, AI suggestions, Cluely-style assist

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';
import { Loader2, Video, Users, FileText, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Mic } from 'lucide-react';
import { toast } from 'sonner';

interface ActionItem {
  title: string;
  assignee: string | null;
  priority: 'high' | 'medium' | 'low';
  due_date: string | null;
}

interface Transcript {
  id: string;
  platform: 'zoom' | 'teams' | 'meet';
  title: string;
  summary: string;
  action_items: ActionItem[];
  meeting_date: string;
  status: string;
  created_at: string;
}

const platformIcon = (platform: string) => {
  if (platform === 'zoom') return <span className="text-blue-500 text-xs font-bold">ZOOM</span>;
  if (platform === 'teams') return <span className="text-indigo-500 text-xs font-bold">TEAMS</span>;
  return <span className="text-green-500 text-xs font-bold">MEET</span>;
};

const priorityColor = (priority: string) => {
  if (priority === 'high') return 'bg-red-50 text-red-600 border-red-200';
  if (priority === 'medium') return 'bg-amber-50 text-amber-600 border-amber-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
};

export const MeetingTranscripts: React.FC = () => {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => { loadTranscripts(); }, []);

  const loadTranscripts = async () => {
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      const resp = await fetch(apiUrl('/api/meetings/transcripts'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setTranscripts(data.transcripts || []);
      }
    } catch (e) {
      console.error('Failed to load transcripts:', e);
    } finally {
      setLoading(false);
    }
  };

  const approveActionItem = async (transcriptId: string, actionIndex: number, actionTitle: string) => {
    setApproving(`${transcriptId}-${actionIndex}`);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      await fetch(apiUrl(`/api/meetings/transcripts/${transcriptId}/approve-action`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionIndex }),
      });
      toast.success(`Task created: ${actionTitle}`);
    } catch {
      toast.error('Failed to create task');
    } finally {
      setApproving(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  if (transcripts.length === 0) return (
    <div className="text-center py-12">
      <Mic className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500 font-medium">No meeting transcripts yet</p>
      <p className="text-xs text-gray-400 mt-1">Connect Zoom, Teams, or Google Meet to auto-transcribe meetings</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {transcripts.map(t => (
        <div key={t.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {/* Header */}
          <div
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(expanded === t.id ? null : t.id)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                {platformIcon(t.platform)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{t.title}</p>
                <p className="text-xs text-gray-400">
                  {t.meeting_date ? new Date(t.meeting_date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  }) : new Date(t.created_at).toLocaleDateString()}
                  {' · '}{t.action_items?.length || 0} action items
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {t.status === 'processed' && (
                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full border border-green-200">
                  Processed
                </span>
              )}
              {expanded === t.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </div>

          {/* Expanded content */}
          {expanded === t.id && (
            <div className="border-t border-gray-100 p-4 space-y-4">
              {/* Summary */}
              {t.summary && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    <span className="text-xs font-medium text-gray-600">AI Summary</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{t.summary}</p>
                </div>
              )}

              {/* Action Items */}
              {t.action_items?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Action Items
                  </p>
                  <div className="space-y-2">
                    {t.action_items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl">
                        <div className="flex items-center gap-2.5 flex-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${priorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                          <span className="text-sm text-gray-800">{item.title}</span>
                          {item.assignee && (
                            <span className="text-xs text-gray-400">→ {item.assignee}</span>
                          )}
                        </div>
                        <button
                          onClick={() => approveActionItem(t.id, idx, item.title)}
                          disabled={approving === `${t.id}-${idx}`}
                          className="ml-3 flex items-center gap-1 text-xs text-[#0F766E] hover:text-white hover:bg-[#0F766E] border border-[#0F766E]/30 hover:border-[#0F766E] px-2.5 py-1 rounded-lg transition-all"
                        >
                          {approving === `${t.id}-${idx}`
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />}
                          Create task
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
