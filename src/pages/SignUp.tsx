import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';

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
  const [success, setSuccess] = useState('');
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
      // signInWithJira() redirects to Jira OAuth, which redirects back to /velocity-ai
      signInWithJira();
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with Jira');
      setLoading(false);
    }
  };



  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
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
      setSuccess('Account created! Please check your email (including spam folder) to confirm your account before logging in.');
      // Don't redirect automatically - let user see the email confirmation message
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center font-light p-4">
      <div className="bg-white rounded-2xl p-12 w-full max-w-md shadow-sm">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-light text-sm">V</span>
            </div>
            <span className="text-xl font-light text-gray-900">Velocity AI</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-light text-gray-900 text-center mb-8 tracking-tight">
          Get Started
        </h1>

        {/* Success Message */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-light text-sm text-green-900">Email confirmation sent!</p>
            <p className="font-light text-xs text-green-800 mt-2">{success}</p>
            <p className="font-light text-xs text-green-700 mt-3">
              Once confirmed, you can <Link to="/login" className="underline hover:text-green-900">sign in here</Link>.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-xl p-4">
            <p className="font-light text-sm text-destructive">{error}</p>
          </div>
        )}

        {!success && (
          <>
            {/* Alternative Sign Up */}
            <div className="space-y-3 mb-8">
              <Button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={loading || authLoading}
                variant="outline"
                className="w-full h-11 rounded-xl border-gray-200 border font-light"
              >
                Continue with Google
              </Button>
              <Button
                type="button"
                onClick={handleJiraSignUp}
                disabled={loading || authLoading}
                variant="outline"
                className="w-full h-11 rounded-xl border-gray-200 border font-light"
              >
                Continue with Jira
              </Button>
            </div>

            {/* Divider */}
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-400 font-light">OR</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSignUp} className="space-y-5 mb-8">
              <div>
                <Label htmlFor="email" className="text-sm font-light text-gray-600 mb-2 block">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  disabled={loading}
                  className="h-11 rounded-xl border-gray-200 border font-light placeholder:font-light"
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm font-light text-gray-600 mb-2 block">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  className="h-11 rounded-xl border-gray-200 border font-light placeholder:font-light"
                />
                <p className="text-xs font-light text-gray-500 mt-2">At least 8 characters</p>
              </div>

              <div>
                <Label htmlFor="confirm-password" className="text-sm font-light text-gray-600 mb-2 block">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  className="h-11 rounded-xl border-gray-200 border font-light placeholder:font-light"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-light rounded-xl"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>

            {/* Sign In Link */}
            <div className="text-center">
              <span className="text-sm font-light text-gray-600">Already have an account? </span>
              <Link to="/login" className="text-sm text-primary hover:text-primary/90 font-light">
                Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
