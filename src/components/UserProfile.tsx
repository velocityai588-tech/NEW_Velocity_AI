import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Mail } from 'lucide-react';
import { apiUrl } from '@/lib/api';

interface JiraStatus {
  connected: boolean;
  site?: {
    cloudId: string;
    name: string;
    url: string;
  };
}

export const UserProfile = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [jiraStatus, setJiraStatus] = useState<JiraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check Jira connection status on mount
  useEffect(() => {
    const checkJiraStatus = async () => {
      try {
        const response = await fetch(apiUrl('/api/jira/auth/status'), {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setJiraStatus(data);
        }
      } catch (err) {
        console.error('[UserProfile] Error checking Jira status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkJiraStatus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      // Logout from auth
      if (user) {
        await signOut();
      }
      
      // Disconnect from Jira if connected
      if (jiraStatus?.connected) {
        try {
          await fetch(apiUrl('/api/jira/auth/disconnect'), {
            method: 'POST',
            credentials: 'include',
          });
        } catch (err) {
          console.error('[UserProfile] Error disconnecting Jira:', err);
        }
      }
      
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Show button if either user is connected or Jira is connected
  if (!user && !jiraStatus?.connected) return null;

  // Determine display info based on auth source
  let displayName = 'User';
  let displayEmail = 'Not authenticated';
  let userInitial = 'U';
  
  if (user?.email) {
    displayEmail = user.email;
    userInitial = user.email[0]?.toUpperCase() || 'U';
    displayName = 'Account';
  } else if (jiraStatus?.connected) {
    displayEmail = jiraStatus.site?.name || 'Jira Connected';
    displayName = jiraStatus.site?.name || 'Jira Account';
    userInitial = 'J';
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold hover:shadow-lg transition-shadow cursor-pointer"
        title={displayEmail}
      >
        {userInitial}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Info Section */}
          <div className="bg-gradient-to-r from-blue-50 to-slate-50 px-4 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold">
                {userInitial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="text-xs text-slate-600 truncate">{displayEmail}</p>
              </div>
            </div>
          </div>

          {/* Account Details */}
          <div className="px-4 py-3 space-y-3 border-b border-slate-200">
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">{user ? 'Email' : 'Connected via'}</p>
                <p className="text-sm text-slate-900 truncate font-medium">{displayEmail}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-slate-500">Status</p>
                <p className="text-sm text-slate-900 font-medium">Active</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center">VelocityAI v1.0</p>
          </div>
        </div>
      )}
    </div>
  );
};
