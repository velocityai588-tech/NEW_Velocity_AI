// src/components/projects/IncomingActions.tsx
import { supabase } from '@/lib/supabase';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { getCurrentOrgId } from '@/lib/orgContext';
import { Button } from '@/components/ui/button';
import { Mail, ArrowRight, X, Loader2, Sparkles, FolderPlus, FolderInput } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export interface PendingAction {
  id: string;
  source_email_id: string;
  from_email: string;
  subject: string;
  title: string;
  description: string;
  metadata: any;
  status: 'pending' | 'approved' | 'dismissed';
}

export const IncomingActions = () => {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  const fetchActions = async () => {
    setLoading(true);
    try {
      const resp = await fetch(apiUrl('/api/google/pending-actions'), {
        headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setActions(data.actions || []);
      }
    } catch (e) {
      console.error('Failed to fetch actions', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const resp = await fetch(apiUrl('/api/google/sync'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}` }
      });
      if (resp.ok) {
        const result = await resp.json();
        toast.success(`Synced! Found ${result.count} new items.`);
        fetchActions();
      } else {
        toast.error('Sync failed. Please ensure Gmail is connected and the API server is up.');
      }
    } catch (e) {
      toast.error('Unable to reach the server for Gmail sync.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      const resp = await fetch(apiUrl(`/api/google/actions/${id}/status`), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
        },
        body: JSON.stringify({ status: 'dismissed' })
      });
      if (resp.ok) {
        setActions(actions.filter(a => a.id !== id));
        toast.info('Action dismissed');
      } else {
        toast.error('Failed to dismiss action.');
      }
    } catch (e) {
      toast.error('Server unreachable. Could not dismiss action.');
    }
  };

  useEffect(() => {
    fetchActions();
  }, []);

  if (loading && actions.length === 0) return null;
  if (!loading && actions.length === 0) {
    // Hidden if nothing pending, except maybe a small sync button or indicator
    return null;
  }

  return (
    <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-red-500" />
          <h3 className="text-sm font-medium text-[#1C1917]">Incoming from Gmail</h3>
          <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase transition-all">
            {actions.length} New
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleSync} 
          disabled={syncing}
          className="text-xs text-stone-400 hover:text-stone-900 h-8"
        >
          {syncing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Mail className="w-3 h-3 mr-2" />}
          Sync Now
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map((action) => (
          <div key={action.id} className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
            <button 
              onClick={() => handleDismiss(action.id)}
              className="absolute top-3 right-3 p-1 text-stone-300 hover:text-stone-600 rounded-full hover:bg-stone-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-red-400" />
              </div>
              <div className="pr-6">
                <h4 className="text-sm font-medium text-[#1C1917] line-clamp-1">{action.title}</h4>
                <p className="text-[10px] text-stone-400 mt-0.5 truncate">From: {action.from_email}</p>
              </div>
            </div>

            <p className="text-xs text-stone-500 line-clamp-2 mb-4 h-8">
              {action.description}
            </p>

            <div className="flex gap-2">
              <Button 
                onClick={() => navigate('/projects/create', { state: { incomingAction: action } })}
                className="flex-1 h-9 bg-[#1C1917] hover:bg-stone-800 text-white text-[11px] rounded-xl gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Project
              </Button>
              <Button 
                variant="outline"
                className="flex-1 h-9 border-stone-100 text-[#1C1917] text-[11px] rounded-xl gap-1.5"
                onClick={() => toast.info('Selecting project coming soon...')}
              >
                <FolderInput className="w-3.5 h-3.5" />
                Add to Existing
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
