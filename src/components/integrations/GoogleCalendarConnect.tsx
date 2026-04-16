// src/components/integrations/GoogleCalendarConnect.tsx
import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, CheckCircle2, Link2, Unlink, Calendar, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface GoogleCalendarConnectProps {
  onConnectionChange?: (connected: boolean) => void;
}

export const GoogleCalendarConnect: React.FC<GoogleCalendarConnectProps> = ({ onConnectionChange }) => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => { checkStatus(); }, []);

  // Check if returned from OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'calendar') {
      toast.success('Google Calendar connected! Syncing events...');
      checkStatus();
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
    }
  }, []);

  const getToken = async () =>
    (await supabase.auth.getSession()).data.session?.access_token || '';

  const checkStatus = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const resp = await fetch(apiUrl('/api/calendar/status'), {
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

  const handleConnect = () => {
    setConnecting(true);
    const userId = user?.id || '';
    window.location.href = apiUrl(`/api/calendar/auth/connect?userId=${userId}`);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const token = await getToken();
      const resp = await fetch(apiUrl('/api/calendar/sync'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await resp.json();
      toast.success(`Synced ${data.count} calendar events`);
    } catch {
      toast.error('Failed to sync calendar');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const token = await getToken();
      await fetch(apiUrl('/api/calendar/auth/disconnect'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setConnected(false);
      setEmail(null);
      onConnectionChange?.(false);
      toast.success('Google Calendar disconnected');
    } catch {
      toast.error('Failed to disconnect');
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
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">Google Calendar Connected</span>
          {email && <span className="text-[10px] text-gray-400">{email}</span>}
          <span className="text-[10px] text-gray-400">Syncing team schedules & meetings</span>
        </div>
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#0F766E] border border-gray-200 hover:border-[#0F766E]/30 px-3 py-1.5 rounded-lg transition-all"
        >
          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Sync
        </button>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-all"
        >
          {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
          Disconnect
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <Calendar className="w-4 h-4 text-gray-400" />
        </div>
        <span className="text-sm text-gray-500">Google Calendar not connected</span>
      </div>
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#4285F4] hover:bg-[#3574E2] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
        {connecting ? 'Connecting...' : 'Connect Calendar'}
      </button>
    </div>
  );
};
