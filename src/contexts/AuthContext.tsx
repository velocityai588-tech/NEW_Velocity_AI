import { createContext, useContext, useEffect, useState, useMemo } from 'react';

// Local User and Session types (replacing Supabase types)
interface LocalUser {
  id: string;
  email: string;
  provider?: string;
}

interface LocalSession {
  user: LocalUser | null;
}

interface AuthContextType {
  user: LocalUser | null;
  session: LocalSession | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithJira: () => void;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session in localStorage
    const checkSession = async () => {
      try {
        const storedSession = localStorage.getItem('auth_session');
        if (storedSession) {
          const parsedSession = JSON.parse(storedSession);
          setSession(parsedSession);
          setUser(parsedSession.user ?? null);
          console.log('[Auth] Session restored from storage');
        }
        setLoading(false);
      } catch (error) {
        console.error('[Auth] Error checking session:', error instanceof Error ? error.message : error);
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const signUp = async (email: string, password: string) => {
    // Placeholder for custom sign up logic
    console.log('[Auth] Sign up called for:', email);
    // Implement custom sign up logic or redirect to sign up provider
    throw new Error('Sign up not yet implemented');
  };

  const signIn = async (email: string, password: string) => {
    // Placeholder for custom sign in logic
    console.log('[Auth] Sign in called for:', email);
    // Implement custom sign in logic or redirect to sign in provider
    throw new Error('Sign in not yet implemented');
  };

  const signInWithGoogle = async () => {
    // Use environment-specific redirect URL
    let redirectUrl: string;
    
    if (import.meta.env.DEV) {
      redirectUrl = `${window.location.origin}/auth/callback`;
    } else {
      redirectUrl = window.location.origin + '/auth/callback';
    }

    console.log('[OAuth] Signing in with Google, redirect to:', redirectUrl);
    
    // Placeholder: Implement Google OAuth flow
    throw new Error('Google OAuth not yet implemented');
  };

  const signInWithJira = () => {
    // Jira OAuth flow - redirects to backend which handles Atlassian OAuth
    console.log('[OAuth] Signing in with Jira');
    window.location.href = `${window.location.origin}/api/jira/auth/connect`;
  };

  const signOut = async () => {
    // Clear session from storage
    localStorage.removeItem('auth_session');
    setSession(null);
    setUser(null);
    console.log('[Auth] User signed out');
  };

  const resetPassword = async (email: string) => {
    // Placeholder for password reset logic
    console.log('[Auth] Password reset requested for:', email);
    throw new Error('Password reset not yet implemented');
  };

  const updatePassword = async (newPassword: string) => {
    // Placeholder for update password logic
    console.log('[Auth] Password update requested');
    throw new Error('Password update not yet implemented');
  };

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithJira,
    signOut,
    resetPassword,
    updatePassword,
  }), [user, session, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
