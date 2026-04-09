import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { TrendingUp, Star } from 'lucide-react';

interface EngineerGrowth {
  userId: string;
  name: string;
  topSkill: string;
  taskCount: number;
  skillBreakdown: { skill: string; count: number; trend: 'up' | 'new' | 'steady' }[];
  readinessSignal: string | null;
}

const SKILL_KEYWORDS: Record<string, string[]> = {
  'React/Frontend': ['react', 'frontend', 'ui', 'css', 'component', 'typescript'],
  'Python/Backend': ['python', 'backend', 'api', 'endpoint', 'fastapi', 'django'],
  'Database': ['sql', 'database', 'migration', 'schema', 'query', 'supabase'],
  'DevOps': ['deploy', 'docker', 'ci', 'cd', 'infrastructure', 'kubernetes'],
  'Testing': ['test', 'qa', 'spec', 'e2e', 'unit test'],
  'Security': ['auth', 'security', 'jwt', 'oauth', 'encryption'],
  'ML/AI': ['ml', 'ai', 'model', 'training', 'inference', 'llm'],
};

const SENIORITY_THRESHOLD = 10; // tasks in a skill to signal readiness

export const EngineerGrowthTracker: React.FC = () => {
  const [engineers, setEngineers] = useState<EngineerGrowth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;
      try {
        // Get completed tasks with assignees
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

        const { data: tasks } = await supabase
          .from('tasks')
          .select('name, status, assignee_id, created_at, users(name)')
          .not('assignee_id', 'is', null)
          .gte('created_at', threeMonthsAgo.toISOString());

        if (!tasks?.length) return;

        // Group by assignee and count skills
        const userSkills: Record<string, {
          name: string;
          skills: Record<string, number>;
          recentSkills: Record<string, number>;
          total: number;
        }> = {};

        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

        tasks.forEach((t: any) => {
          const uid = t.assignee_id;
          const name = t.users?.name || 'Unknown';
          const taskName = (t.name || '').toLowerCase();
          const isRecent = new Date(t.created_at) >= oneMonthAgo;

          if (!userSkills[uid]) {
            userSkills[uid] = { name, skills: {}, recentSkills: {}, total: 0 };
          }

          userSkills[uid].total++;

          Object.entries(SKILL_KEYWORDS).forEach(([skill, kws]) => {
            if (kws.some(kw => taskName.includes(kw))) {
              userSkills[uid].skills[skill] = (userSkills[uid].skills[skill] || 0) + 1;
              if (isRecent) {
                userSkills[uid].recentSkills[skill] = (userSkills[uid].recentSkills[skill] || 0) + 1;
              }
            }
          });
        });

        const result: EngineerGrowth[] = Object.entries(userSkills)
          .filter(([, data]) => data.total >= 3)
          .map(([uid, data]) => {
            const sortedSkills = Object.entries(data.skills)
              .sort((a, b) => b[1] - a[1]);

            const skillBreakdown = sortedSkills.slice(0, 4).map(([skill, count]) => {
              const recentCount = data.recentSkills[skill] || 0;
              const trend = recentCount >= 3 ? 'up' : recentCount >= 1 ? 'new' : 'steady';
              return { skill, count, trend: trend as 'up' | 'new' | 'steady' };
            });

            const topSkill = sortedSkills[0]?.[0] || 'General';
            const topCount = sortedSkills[0]?.[1] || 0;

            // Readiness signal
            let readinessSignal: string | null = null;
            if (topCount >= SENIORITY_THRESHOLD) {
              readinessSignal = `${data.name} has completed ${topCount} ${topSkill} tasks — ready for senior ${topSkill} role`;
            }

            return {
              userId: uid,
              name: data.name,
              topSkill,
              taskCount: data.total,
              skillBreakdown,
              readinessSignal,
            };
          })
          .sort((a, b) => b.taskCount - a.taskCount);

        setEngineers(result);
      } catch (e) {
        console.error('EngineerGrowthTracker error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || engineers.length === 0) return null;

  const trendColors = {
    up: 'bg-teal-50 text-[#0F766E] border-teal-100',
    new: 'bg-blue-50 text-blue-600 border-blue-100',
    steady: 'bg-gray-50 text-gray-500 border-gray-100',
  };

  const trendLabels = { up: '↑', new: '★', steady: '·' };

  const readyEngineers = engineers.filter(e => e.readinessSignal);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-gray-900">Engineer Growth Tracker</h3>
        <span className="text-xs text-gray-400 ml-1">— last 90 days</span>
      </div>

      {/* Readiness signals */}
      {readyEngineers.length > 0 && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-xs font-medium text-amber-700 mb-1.5 flex items-center gap-1">
            <Star className="w-3 h-3" /> Promotion signals
          </p>
          {readyEngineers.map(e => (
            <p key={e.userId} className="text-xs text-amber-600">
              {e.readinessSignal}
            </p>
          ))}
        </div>
      )}

      {/* Engineer cards */}
      <div className="divide-y divide-gray-50">
        {engineers.map(eng => (
          <div key={eng.userId} className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {eng.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{eng.name}</p>
                  <p className="text-xs text-gray-400">{eng.taskCount} tasks · strongest in {eng.topSkill}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {eng.skillBreakdown.map(({ skill, count, trend }) => (
                <span
                  key={skill}
                  className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${trendColors[trend]}`}
                >
                  <span>{trendLabels[trend]}</span>
                  {skill}
                  <span className="opacity-60">{count}x</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
