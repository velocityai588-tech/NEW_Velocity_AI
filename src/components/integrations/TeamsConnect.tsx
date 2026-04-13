// src/components/integrations/TeamsConnect.tsx
import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';

// Microsoft Teams SVG icon
const TeamsIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
    <path d="M20.625 7.125a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" fill="#5059C9"/>
    <path d="M22.5 10.5h-5.812a.563.563 0 0 0-.563.563v5.062a4.125 4.125 0 0 0 6.375 3.459V11.625A1.125 1.125 0 0 0 22.5 10.5Z" fill="#5059C9"/>
    <path d="M13.5 5.25a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z" fill="#7B83EB"/>
    <path d="M15.75 10.5H2.25A1.5 1.5 0 0 0 .75 12v6.375a5.625 5.625 0 0 0 11.25 0V12a1.5 1.5 0 0 0-1.5-1.5h5.25Z" fill="#7B83EB"/>
  </svg>
);

interface TeamsConnectProps {
  onConnectionChange?: (connected: boolean) => void;
}

export const TeamsConnect: React.FC<TeamsConnectProps> = ({ onConnectionChange }) => {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => { checkStatus(); }, []);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      const resp = await fetch(apiUrl('/api/teams/status'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setConnected(data.connected);
        setEmail(data.email);
        onConnectionChange?.(data.connected);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = user?.user_metadata?.organization_id || '';
    window.location.href = apiUrl(`/api/teams/auth/connect?orgId=${orgId}`);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      await fetch(apiUrl('/api/teams/auth/disconnect'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setConnected(false);
      setEmail(null);
      onConnectionChange?.(false);
      toast.success('Microsoft Teams disconnected');
    } catch {
      toast.error('Failed to disconnect Teams');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin" /> Checking...
    </div>
  );

  if (connected) return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
          <TeamsIcon />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">Microsoft Teams Connected</span>
          {email && <span className="text-[10px] text-gray-400">{email}</span>}
          <span className="text-[10px] text-gray-400">Auto-transcribing meetings</span>
        </div>
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />
      </div>
      <button
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-all"
      >
        {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
        Disconnect
      </button>
    </div>
  );

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <TeamsIcon />
        </div>
        <span className="text-sm text-gray-500">Microsoft Teams not connected</span>
      </div>
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#5059C9] hover:bg-[#4049B8] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
        {connecting ? 'Connecting...' : 'Connect Teams'}
      </button>
    </div>
  );
};
