import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { setupProgressService, SETUP_STEPS } from '@/services/setupProgressService';
import { Rocket, ArrowRight, X } from 'lucide-react';

/**
 * OnboardingContinueBanner
 * Shows on the dashboard when a manager has started but not completed onboarding.
 * "Continue where you left off" — links directly to the next incomplete step.
 */
export const OnboardingContinueBanner: React.FC = () => {
  const { orgId, orgName } = useAuth();
  const navigate = useNavigate();
  const [nextStep, setNextStep] = useState<{ label: string; route: string } | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('onboarding_continue_dismissed') === 'true'
  );

  useEffect(() => {
    if (!orgId || dismissed) return;
    const load = async () => {
      try {
        const completed = await setupProgressService.getProgress(orgId);
        // Don't show if fully complete or just starting (0 steps)
        if (completed.length === 0 || setupProgressService.isComplete(completed)) return;
        const incomplete = setupProgressService.getIncompleteItems(completed);
        if (incomplete.length > 0) {
          setNextStep({ label: incomplete[0].label, route: incomplete[0].route });
          setCompletedCount(completed.length);
        }
      } catch (e) {
        console.error('OnboardingContinueBanner error:', e);
      }
    };
    load();
  }, [orgId, dismissed]);

  const handleDismiss = () => {
    localStorage.setItem('onboarding_continue_dismissed', 'true');
    setDismissed(true);
  };

  if (!nextStep || dismissed) return null;

  const totalSteps = SETUP_STEPS.length;
  const pct = Math.round((completedCount / totalSteps) * 100);

  return (
    <div className="mx-8 mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Rocket className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">
            Continue setting up {orgName ? `"${orgName}"` : 'your workspace'}
          </p>
          <p className="text-xs text-amber-700 font-light mt-0.5">
            {pct}% complete — next: {nextStep.label}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => navigate(nextStep.route)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-all"
        >
          Continue
          <ArrowRight className="w-3 h-3" />
        </button>
        <button onClick={handleDismiss} className="p-1 text-amber-400 hover:text-amber-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
