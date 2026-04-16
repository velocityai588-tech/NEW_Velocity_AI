import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { Plus, X, Loader2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface QuickCreateTaskProps {
  onTaskCreated?: () => void;
}

export const QuickCreateTask: React.FC<QuickCreateTaskProps> = ({ onTaskCreated }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const loadData = async () => {
    const orgId = getCurrentOrgId();
    if (!orgId) return;
    try {
      const [projectsRes, membersRes] = await Promise.all([
        supabase.from('projects').select('id, name').eq('organization_id', orgId).eq('status', 'active').limit(20),
        supabase.from('users').select('id, name').eq('organization_id', orgId).limit(20),
      ]);
      setProjects(projectsRes.data || []);
      setMembers(membersRes.data || []);
    } catch (e) {
      console.error('QuickCreateTask loadData error:', e);
    }
  };

  const handleParse = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      // Match assignee and project from input text directly
      const member = members.find(m => input.toLowerCase().includes(m.name?.toLowerCase()));
      const project = projects.find(p => input.toLowerCase().includes(p.name?.toLowerCase()));
      const parsedData = {
        name: input,
        assigneeId: member?.id || null,
        projectId: project?.id || null,
      };
      setParsed(parsedData);
      await autoSave(parsedData);
    } catch (e) {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const autoSave = async (parsedData: any) => {
    if (!parsedData?.name) return;
    setSaving(true);
    try {
      const orgId = getCurrentOrgId();
      const { error } = await supabase.from('tasks').insert({
        name: parsedData.name,
        project_id: parsedData.projectId || null,
        assignee_id: parsedData.assigneeId || null,
        organization_id: orgId,
        status: 'not_started',
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`Task "${parsedData.name}" created${parsedData.assigneeId ? ' and assigned' : ''}`);
      setIsOpen(false);
      setInput('');
      setParsed(null);
      onTaskCreated?.();
    } catch (e) {
      toast.error('Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!parsed?.name) return;
    setSaving(true);
    try {
      const orgId = getCurrentOrgId();
      const { error } = await supabase.from('tasks').insert({
        name: parsed.name,
        project_id: parsed.projectId || null,
        assignee_id: parsed.assigneeId || null,
        organization_id: orgId,
        status: 'not_started',
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`Task "${parsed.name}" created`);
      setIsOpen(false);
      setInput('');
      setParsed(null);
      onTaskCreated?.();
    } catch (e) {
      toast.error('Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Premium floating + button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 w-12 h-12 rounded-full bg-[#1C1917] text-white flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.05)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.35),0_0_20px_rgba(45,212,191,0.2)] hover:bg-[#292524] hover:scale-105 transition-all duration-200 z-40 group"
        title="Quick create task"
      >
        <Plus className="w-5 h-5 group-hover:text-[#2DD4BF] transition-colors duration-200" strokeWidth={2} />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-50 flex items-end justify-end p-6" onClick={() => setIsOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-[400px] p-5 border border-gray-100 animate-in slide-in-from-bottom-4 fade-in duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#2DD4BF] flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-[#1C1917]" fill="currentColor" />
                </div>
                <span className="text-sm font-medium text-gray-900">Quick create task</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); setParsed(null); }}
                onKeyDown={e => e.key === 'Enter' && !parsed && handleParse()}
                placeholder="e.g. Fix login bug, assign Sarah, high priority"
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm placeholder-gray-300 focus:outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/20 transition-all"
              />
              {!parsed && (
                <button
                  onClick={handleParse}
                  disabled={loading || !input.trim()}
                  className="px-3 py-2 rounded-xl bg-[#1C1917] text-white text-sm font-medium hover:bg-[#292524] disabled:opacity-40 transition-all flex items-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {loading ? '…' : 'Parse'}
                </button>
              )}
            </div>

            {parsed && (
              <div className="space-y-2 mb-4">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm">
                  <p className="font-medium text-gray-900 mb-1">{parsed.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.projectId && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                        {projects.find(p => p.id === parsed.projectId)?.name}
                      </span>
                    )}
                    {parsed.assigneeId && (
                      <span className="text-xs px-2 py-0.5 bg-teal-50 text-teal-600 rounded-full">
                        → {members.find(m => m.id === parsed.assigneeId)?.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2 rounded-xl bg-[#1C1917] text-white text-sm font-medium hover:bg-[#292524] disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {saving ? 'Creating…' : 'Create task'}
                  </button>
                  <button
                    onClick={() => setParsed(null)}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-all"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
