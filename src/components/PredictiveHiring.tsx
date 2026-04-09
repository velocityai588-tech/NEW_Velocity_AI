import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { Users, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface HiringPrediction {
  role: string;
  quarter: string;
  reason: string;
  skills: string[];
  urgency: 'high' | 'medium' | 'low';
}

export const PredictiveHiring: React.FC = () => {
  const [predictions, setPredictions] = useState<HiringPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingJD, setGeneratingJD] = useState<string | null>(null);
  const [jobDescriptions, setJobDescriptions] = useState<Record<string, string>>({});

  const SKILL_KEYWORDS: Record<string, string[]> = {
    'Frontend Engineer': ['react', 'frontend', 'ui', 'css', 'typescript', 'component'],
    'Backend Engineer': ['python', 'backend', 'api', 'endpoint', 'node', 'server'],
    'DevOps Engineer': ['deploy', 'docker', 'ci', 'cd', 'infrastructure', 'kubernetes'],
    'Mobile Engineer': ['ios', 'android', 'mobile', 'react native'],
    'Data Engineer': ['ml', 'data', 'pipeline', 'analytics', 'model'],
    'Security Engineer': ['auth', 'security', 'encryption', 'compliance', 'oauth'],
  };

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;
      try {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

        const { data: tasks } = await supabase
          .from('tasks')
          .select('name, status, assignee_id, created_at')
          .gte('created_at', threeMonthsAgo.toISOString());

        const { data: users } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', orgId);

        if (!tasks?.length) return;

        // Count skill demand from task names
        const skillDemand: Record<string, number> = {};
        tasks.forEach(t => {
          const name = (t.name || '').toLowerCase();
          Object.entries(SKILL_KEYWORDS).forEach(([role, kws]) => {
            if (kws.some(kw => name.includes(kw))) {
              skillDemand[role] = (skillDemand[role] || 0) + 1;
            }
          });
        });

        // Count unassigned tasks per skill
        const unassigned = tasks.filter(t => !t.assignee_id);
        const unassignedDemand: Record<string, number> = {};
        unassigned.forEach(t => {
          const name = (t.name || '').toLowerCase();
          Object.entries(SKILL_KEYWORDS).forEach(([role, kws]) => {
            if (kws.some(kw => name.includes(kw))) {
              unassignedDemand[role] = (unassignedDemand[role] || 0) + 1;
            }
          });
        });

        // Predict hiring needs
        const teamSize = users?.length || 1;
        const growthRate = tasks.length / 90; // tasks per day
        const preds: HiringPrediction[] = [];

        Object.entries(skillDemand)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .forEach(([role, count]) => {
            const unassignedCount = unassignedDemand[role] || 0;
            const demandPerPerson = count / teamSize;
            const urgency = unassignedCount > 5 ? 'high' : demandPerPerson > 3 ? 'medium' : 'low';
            const quarter = urgency === 'high' ? 'Q2 2026' : urgency === 'medium' ? 'Q3 2026' : 'Q4 2026';

            preds.push({
              role,
              quarter,
              reason: `${count} related tasks in last 90 days, ${unassignedCount} currently unassigned`,
              skills: SKILL_KEYWORDS[role].slice(0, 4),
              urgency,
            });
          });

        setPredictions(preds);
      } catch (e) {
        console.error('PredictiveHiring error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleGenerateJD = async (role: string, skills: string[]) => {
    setGeneratingJD(role);
    try {
      const res = await fetch('/api/ai/expand-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${role} job description`,
          description: `Write a concise job description for a ${role} at a fast-growing AI startup. Required skills: ${skills.join(', ')}. Include: role summary, 3 key responsibilities, 4 required skills, and compensation range. Keep it under 200 words.`
        })
      });
      if (res.ok) {
        const data = await res.json();
        setJobDescriptions(prev => ({ ...prev, [role]: data.description || '' }));
      }
    } catch (e) {
      toast.error('Failed to generate JD');
    } finally {
      setGeneratingJD(null);
    }
  };

  if (loading || predictions.length === 0) return null;

  const urgencyColor = { high: 'bg-amber-100 text-amber-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-gray-900">Predictive Hiring</h3>
          <span className="text-xs text-gray-400 ml-1">— based on 90 days of project data</span>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {predictions.map(p => (
          <div key={p.role} className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900">{p.role}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgencyColor[p.urgency]}`}>
                    {p.urgency === 'high' ? 'Needed now' : p.quarter}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{p.reason}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {p.skills.map(s => (
                <span key={s} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{s}</span>
              ))}
            </div>

            {jobDescriptions[p.role] ? (
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 leading-relaxed mb-2 whitespace-pre-wrap">
                {jobDescriptions[p.role]}
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={() => handleGenerateJD(p.role, p.skills)}
                disabled={generatingJD === p.role}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {generatingJD === p.role ? <Loader2 className="w-3 h-3 animate-spin" /> : '✦'}
                {jobDescriptions[p.role] ? 'Regenerate JD' : 'Generate Job Description'}
              </button>
              {jobDescriptions[p.role] && (
                <button
                  onClick={() => { navigator.clipboard.writeText(jobDescriptions[p.role]); toast.success('Copied!'); }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
