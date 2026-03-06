import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap } from 'lucide-react';
import AuthLayout from '@/components/shared/AuthLayout';
import { FormError, validators } from '@/components/shared/FormError';

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (container: HTMLElement | null, config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
        };
      };
    };
  }
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const JiraIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.53 2C6.46 2.05 2.05 6.46 2 11.53V22h10.47V2h-.94z" fill="#2684FF"/>
    <path d="M12.94 13.12v8.88h8.88c-.05-4.88-4-8.83-8.88-8.88z" fill="#0052CC"/>
  </svg>
);

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  const [loginAttempted, setLoginAttempted] = useState(false);
  const { signIn, signInWithGoogle, signInWithJira, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If user is already authenticated, redirect to dashboard
  useEffect(() => {
    if (user && !authLoading) {
      console.log('[Login] User already authenticated, redirecting to velocity-ai');
      navigate('/velocity-ai', { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
      }
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleGoogleResponse = async (response: any) => {
    try {
      setLoading(true);
      setError('');
      if (response.credential) {
        // OAuth flow will redirect away, so we don't need to navigate
        await signInWithGoogle();
      }
    } catch (err: any) {
      console.error('[Login] Google auth error:', err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      // OAuth flow will redirect away to Google, then back to /auth/callback
      // No need to navigate here - the redirect will happen automatically
      await signInWithGoogle();
    } catch (err: any) {
      console.error('[Login] Google sign-in error:', err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleJiraSignIn = () => {
    try {
      setLoading(true);
      setError('');
      signInWithJira();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Jira');
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginAttempted(true);
    
    // Validate
    const errors: Record<string, string> = {};
    const emailErr = validators.email(email);
    if (emailErr) errors.email = emailErr;
    const passErr = validators.required(password, 'Password');
    if (passErr) errors.password = passErr;
    setLoginErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      // After sign-in, check if user has an org. If not, send to onboarding.
      const { data: membership } = await (await import('@/lib/supabase')).supabase
        .from('organization_members')
        .select('org_id')
        .limit(1)
        .maybeSingle();
      if (membership?.org_id) {
        navigate('/velocity-ai');
      } else {
        navigate('/onboarding/mode');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to log in';
      if (errorMessage.includes('Email not confirmed') || errorMessage.includes('email_not_confirmed')) {
        setError('Please confirm your email address first. Check your inbox.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-10 text-center lg:text-left">
        <div className="lg:hidden flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="bg-[#1C1917] rounded-xl p-2 shadow-md">
              <Zap className="h-5 w-5 text-white fill-white" />
            </div>
            <span className="font-medium text-[#292524] text-xl">Velocity AI</span>
          </div>
        </div>
        <h1 className="text-3xl font-semibold text-[#1C1917] mb-3 tracking-tight">
          Welcome back
        </h1>
        <p className="text-[#78716C] font-normal">
          Enter your credentials to access your workspace.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-600">{error}</p>
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Button 
          variant="outline" 
          onClick={handleGoogleSignIn}
          disabled={loading || authLoading}
          className="h-12 rounded-lg border-[#E7E5E4] hover:bg-[#FAFAF9] hover:border-[#D6D3D1] transition-all flex items-center justify-center gap-2 text-[#57534E] font-medium"
          title="Continue with Google"
        >
          <GoogleIcon /> <span className="text-sm">Google</span>
        </Button>
        <Button 
          variant="outline" 
          onClick={handleJiraSignIn}
          disabled={loading || authLoading}
          className="h-12 rounded-lg border-[#E7E5E4] hover:bg-[#FAFAF9] hover:border-[#D6D3D1] transition-all flex items-center justify-center gap-2 text-[#57534E] font-medium"
          title="Continue with Jira"
        >
          <JiraIcon /> <span className="text-sm">Jira</span>
        </Button>
      </div>
      
      <div className="relative mb-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#E7E5E4]"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase tracking-wider font-medium">
          <span className="px-4 bg-white text-[#A8A29E]">Or continue with email</span>
        </div>
      </div>
      
      <form onSubmit={handleLogin} className="space-y-5 mb-8">
        <div>
          <Label htmlFor="email" className="text-sm font-medium text-[#57534E] mb-1.5 block">Email address</Label>
          <Input 
            id="email" 
            type="email" 
            placeholder="name@company.com" 
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (loginAttempted) { const err = validators.email(e.target.value); setLoginErrors(prev => ({ ...prev, email: err })); } }}
            disabled={loading}
            className={`h-11 rounded-lg bg-[#FAFAF9] focus:bg-white focus:ring-2 focus:ring-[#1C1917]/10 transition-all font-normal placeholder:text-[#A8A29E] ${loginErrors.email ? 'border-[#BE123C] focus:ring-[#BE123C]/10' : 'border-[#E7E5E4]'}`}
          />
          <FormError message={loginErrors.email} />
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-[#57534E]">Password</Label>
            <Link to="#" className="text-xs font-medium text-[#78716C] hover:text-[#1C1917]">Forgot password?</Link>
          </div>
          <Input 
            id="password" 
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (loginAttempted) { const err = validators.required(e.target.value, 'Password'); setLoginErrors(prev => ({ ...prev, password: err })); } }}
            disabled={loading}
            className={`h-11 rounded-lg bg-[#FAFAF9] focus:bg-white focus:ring-2 focus:ring-[#1C1917]/10 transition-all font-normal placeholder:text-[#A8A29E] ${loginErrors.password ? 'border-[#BE123C] focus:ring-[#BE123C]/10' : 'border-[#E7E5E4]'}`}
          />
          <FormError message={loginErrors.password} />
        </div>

        <Button 
          type="submit"
          disabled={loading}
          className="w-full h-11 bg-[#1C1917] hover:bg-[#292524] rounded-lg font-medium transition-all duration-300 text-white shadow-lg shadow-stone-900/10"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      
      <div className="text-center">
        <span className="text-sm text-[#78716C]">Don't have an account? </span>
        <Link to="/signup" className="text-sm text-[#1C1917] font-semibold hover:underline">
          Sign up
        </Link>
      </div>
    </AuthLayout>
  );
}