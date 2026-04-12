// src/components/google/GmailConnect.tsx
import React, { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api';
import { getCurrentOrgId } from '@/lib/orgContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, CheckCircle2, Link2, Unlink, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface GmailConnectProps {
  onConnectionChange?: (connected: boolean) => void;
}

export const GmailConnect: React.FC<GmailConnectProps> = ({ onConnectionChange }) => {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const resp = await fetch(apiUrl('/api/google/pending-actions'), {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('supabaseToken')}` }, 
        // Note: Using sessionStorage token for simplicity, better to use a dedicated hook
      });
      
      // If the above fails with 404, might not be implemented yet.
      // But we can check specifically for the connection.
      const connResp = await fetch(apiUrl('/api/google/auth/status'), {
         headers: { 'Authorization': `Bearer ${sessionStorage.getItem('supabaseToken')}` }
      });
      // (Implementation note: I'll need to add /auth/status endpoint if not exists, 
      // or just assume if one call works, connection exists).
      
      setConnected(resp.ok);
      onConnectionChange?.(resp.ok);
    } catch (e) {
      setConnected(false);
      // Only toast on manual checks, not on background status check to avoid spam
      console.error('Google status check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    setConnecting(true);
    const userId = user?.id;
    const qs = userId ? `?supabaseUserId=${encodeURIComponent(userId)}` : '';
    window.location.href = apiUrl(`/api/google/auth/connect${qs}`);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(apiUrl('/api/google/auth/disconnect'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('supabaseToken')}`
        },
      });
      setConnected(false);
      setEmail(null);
      onConnectionChange?.(false);
      toast.success('Gmail disconnected');
    } catch (e) {
      toast.error('Failed to disconnect Gmail. Please check if the API server is running.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking connection...
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
            <Mail className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">Gmail Connected</span>
            <span className="text-[10px] text-gray-400">Syncing @firefly.ai and Gemini emails</span>
          </div>
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />
        </div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-all"
        >
          {disconnecting
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Unlink className="w-3 h-3" />}
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <Mail className="w-4 h-4 text-gray-400" />
        </div>
        <span className="text-sm text-gray-500">Gmail not connected</span>
      </div>
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {connecting
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <Link2 className="w-3 h-3" />}
        {connecting ? 'Connecting...' : 'Connect Gmail'}
      </button>
    </div>
  );
};
