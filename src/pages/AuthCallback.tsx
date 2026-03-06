import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, orgId } = useAuth();
  const [error, setError] = useState('');
  const hasRedirectedRef = useRef(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  // Check if there's a magic link token (from Jira OAuth)
  const magicLinkToken = searchParams.get('token');
  const isJiraCallback = searchParams.get('jira') === 'true';

  // Safety timeout: if auth doesn't resolve in 5 seconds, assume it failed and try redirecting anyway
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('[AuthCallback] Auth resolution timeout, forcing redirect');
      setTimedOut(true);
      setLocalLoading(false);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    // If we have a magic link token, use it to sign in
    if (magicLinkToken && !user && !loading) {
      console.log('[AuthCallback] Processing magic link token from Jira');
      const handleMagicLink = async () => {
        try {
          // Use the token from the magic link to sign in
          // Note: Supabase magic links use email+token verification
          // The token should be processed by Supabase client automatically from URL
          const { data, error: signInError } = await supabase.auth.verifyOtp({
            token_hash: magicLinkToken,
            type: 'magiclink',
          });

          if (signInError) {
            console.error('[AuthCallback] Failed to verify magic link:', signInError.message);
            throw signInError;
          }

          console.log('[AuthCallback] ✓ Magic link verified, user signed in');
          setLocalLoading(false);
        } catch (err: any) {
          console.warn('[AuthCallback] Magic link verification failed:', err.message);
          // Continue anyway - user might still be in local session
          setLocalLoading(false);
        }
      };

      handleMagicLink();
      return;
    }

    setLocalLoading(false);
  }, [magicLinkToken, user, loading]);

  useEffect(() => {
    if ((loading || localLoading) && !timedOut) return; // Don't do anything while loading (unless timed out)

    // Only redirect once
    if (hasRedirectedRef.current) return;

    console.log('[AuthCallback] Auth check complete');
    console.log('[AuthCallback] User:', user ? 'authenticated' : 'not authenticated');
    console.log('[AuthCallback] OrgId:', orgId);
    console.log('[AuthCallback] Timed out:', timedOut);

    if (user) {
      // Check if user has an org — if not, they need onboarding
      const checkOrgAndRedirect = async () => {
        // Give a moment for orgId to resolve from AuthContext
        // If orgId is already set, use it; otherwise query directly
        let hasOrg = !!orgId;

        if (!hasOrg) {
          // Double-check directly from Supabase in case AuthContext hasn't resolved yet
          const { data } = await supabase
            .from('organization_members')
            .select('org_id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
          hasOrg = !!data?.org_id;
        }

        hasRedirectedRef.current = true;

        if (hasOrg) {
          console.log('[AuthCallback] User has org, redirecting to velocity-ai');
          navigate('/velocity-ai', { replace: true });
        } else {
          console.log('[AuthCallback] New user (no org), redirecting to onboarding');
          navigate('/onboarding/mode', { replace: true });
        }
      };
      checkOrgAndRedirect();
    } else {
      // No user authenticated - send to login
      hasRedirectedRef.current = true;
      console.log('[AuthCallback] No user authenticated, redirecting to login');
      setError('Authentication failed. Please try again.');
      navigate('/login', { replace: true });
    }
  }, [loading, localLoading, user, orgId, navigate, timedOut]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-slate-600">Completing authentication...</p>
        {error && <p className="text-red-600 mt-2">{error}</p>}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 text-xs text-slate-500 max-w-md mx-auto">
            <p>Debug: user={user ? 'yes' : 'no'}, loading={loading ? 'yes' : 'no'}, timeout={timedOut ? 'yes' : 'no'}</p>
            <p>jira={isJiraCallback ? 'yes' : 'no'}, token={magicLinkToken ? 'yes' : 'no'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
