import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, Eye, EyeOff, ChevronRight } from 'lucide-react';
import AuthLayout from '@/components/shared/AuthLayout';
import { FormError, validators } from '@/components/shared/FormError';

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

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signUp, signInWithGoogle, signInWithJira, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleGoogleSignUp = async () => {
    try {
      setLoading(true);
      setError('');
      // Save email to Supabase if provided
      if (email.trim()) {
        await saveEmailInterest(email);
      }
      // signInWithGoogle() redirects to Google, which redirects back to /auth/callback
      // AuthCallback will handle the redirect to /velocity-ai
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with Google');
      setLoading(false);
    }
  };

  const handleJiraSignUp = () => {
    try {
      setLoading(true);
      setError('');
      // Save email to Supabase if provided
      if (email.trim()) {
        saveEmailInterest(email);
      }
      // signInWithJira() redirects to Jira OAuth, which redirects back to /velocity-ai
      signInWithJira();
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with Jira');
      setLoading(false);
    }
  };

  const saveEmailInterest = async (emailAddress: string) => {
    try {
      console.log('[Email Interest] Attempting to save:', emailAddress);
      const { data, error } = await supabase
        .from('email_interests')
        .insert([
          {
            email: emailAddress,
            source: 'signup_form',
            created_at: new Date().toISOString(),
          }
        ]);
      if (error) {
        console.error('[Email Interest] Supabase error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
      } else {
        console.log('[Email Interest] Successfully saved:', data);
      }
    } catch (err) {
      console.error('[Email Interest] Unexpected error:', err);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password);
      // Account created & auto-signed-in — go straight to onboarding
      navigate('/onboarding/mode');
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
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
          Create Your Account
        </h1>
        <p className="text-[#78716C] font-normal">
          Start optimizing your engineering capacity today.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-600">{error}</p>
        </div>
      )}

          <div className="grid grid-cols-2 gap-4 mb-8">
            <Button 
              variant="outline" 
              onClick={handleGoogleSignUp}
              disabled={loading || authLoading}
              className="h-11 border-[#E7E5E4] hover:bg-[#FAFAF9] flex items-center justify-center rounded-lg" 
              aria-label="Continue with Google"
            >
              <GoogleIcon />
            </Button>
            <Button 
              variant="outline" 
              onClick={handleJiraSignUp}
              disabled={loading || authLoading}
              className="h-11 border-[#E7E5E4] hover:bg-[#FAFAF9] flex items-center justify-center rounded-lg" 
              aria-label="Continue with Jira"
            >
              <JiraIcon />
            </Button>
          </div>

          <div className="relative mb-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E7E5E4]"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider font-medium">
              <span className="px-4 bg-white text-[#A8A29E]">Or sign up with email</span>
            </div>
          </div>

          <form onSubmit={handleSignUp} className="space-y-5 mb-8">
            <div>
              <Label htmlFor="work-email" className="text-sm font-medium text-[#57534E] mb-1.5 block">Work Email</Label>
              <Input 
                id="work-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-lg border-[#E7E5E4] bg-[#FAFAF9] focus:bg-white focus:ring-2 focus:ring-[#1C1917]/10 transition-all font-normal placeholder:text-[#A8A29E]"
                placeholder="name@company.com"
                required
                disabled={loading}
              />
            </div>
            
            <div>
              <Label htmlFor="password" className="text-sm font-medium text-[#57534E] mb-1.5 block">Password</Label>
              <div className="relative">
                <Input 
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-lg border-[#E7E5E4] bg-[#FAFAF9] focus:bg-white focus:ring-2 focus:ring-[#1C1917]/10 transition-all font-normal placeholder:text-[#A8A29E] pr-10"
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8A29E] hover:text-[#78716C]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-[#A8A29E] mt-2">Must be at least 8 characters</p>
            </div>

            <div>
              <Label htmlFor="confirm-password" className="text-sm font-medium text-[#57534E] mb-1.5 block">Confirm Password</Label>
              <Input 
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 rounded-lg border-[#E7E5E4] bg-[#FAFAF9] focus:bg-white focus:ring-2 focus:ring-[#1C1917]/10 transition-all font-normal placeholder:text-[#A8A29E]"
                placeholder="••••••••••••"
                required
                disabled={loading}
              />
            </div>

            <Button 
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#1C1917] hover:bg-[#292524] mb-6 rounded-lg font-medium transition-all duration-300 text-white shadow-lg shadow-stone-900/10"
            >
              {loading ? 'Creating account...' : <>Create Account <ChevronRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </form>

          <p className="text-xs text-center text-[#A8A29E] leading-relaxed mb-6">
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </p>

      <div className="text-center">
        <span className="text-sm text-[#78716C]">Already have an account? </span>
        <Link to="/login" className="text-sm text-[#1C1917] font-semibold hover:underline">
          Sign In
        </Link>
      </div>
    </AuthLayout>
  );
}