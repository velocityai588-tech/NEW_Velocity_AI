// src/components/integrations/ZoomConnect.tsx
import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, Link2, Unlink, Video } from 'lucide-react';
import { toast } from 'sonner';

interface ZoomConnectProps {
  onConnectionChange?: (connected: boolean) => void;
}

export const ZoomConnect: React.FC<ZoomConnectProps> = ({ onConnectionChange }) => {
  const { user } = useAuth();
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
      const resp = await fetch(apiUrl('/api/zoom/status'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setConnected(data.connected);
        setEmail(data.email);
        onConnectionChange?.(data.connected);
      }
    } catch (e) {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    // Get org ID from user context
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const orgId = authUser?.user_metadata?.organization_id || '';
    window.location.href = apiUrl(`/api/zoom/auth/connect?orgId=${orgId}`);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || '';
      await fetch(apiUrl('/api/zoom/auth/disconnect'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setConnected(false);
      setEmail(null);
      onConnectionChange?.(false);
      toast.success('Zoom disconnected');
    } catch {
      toast.error('Failed to disconnect Zoom');
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
          <Video className="w-4 h-4 text-blue-500" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">Zoom Connected</span>
          {email && <span className="text-[10px] text-gray-400">{email}</span>}
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
          <Video className="w-4 h-4 text-gray-400" />
        </div>
        <span className="text-sm text-gray-500">Zoom not connected</span>
      </div>
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
        {connecting ? 'Connecting...' : 'Connect Zoom'}
      </button>
    </div>
  );
};
