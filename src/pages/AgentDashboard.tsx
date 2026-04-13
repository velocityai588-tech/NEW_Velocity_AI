import { LiveMeetingAssistant } from '@/components/meetings/LiveMeetingAssistant';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { CheckCircle2, Clock, Users, Zap, RefreshCw, Brain } from 'lucide-react';
import { SkillGraph } from '@/components/SkillGraph';
import { AccuracyTracker } from '@/components/AccuracyTracker';
import { TeamDNAReport } from '@/components/TeamDNAReport';
import { TeamBenchmarks } from '@/components/TeamBenchmarks';
import { ManagerReportCard } from '@/components/ManagerReportCard';
import { PredictiveHiring } from '@/components/PredictiveHiring';
import { WorkloadRebalancer } from '@/components/WorkloadRebalancer';
import { StakeholderUpdate } from '@/components/StakeholderUpdate';
import { RiskHeatmap } from '@/components/RiskHeatmap';
import { ScopeEstimator } from '@/components/ScopeEstimator';
import { RetroGenerator } from '@/components/RetroGenerator';
import { StaleTaskFlagging } from '@/components/StaleTaskFlagging';
import { SprintRetroGenerator } from '@/components/SprintRetroGenerator';
import { CapacityNegotiator } from '@/components/CapacityNegotiator';
import { EngineerGrowthTracker } from '@/components/EngineerGrowthTracker';
import { ProjectComplexityScore } from '@/components/ProjectComplexityScore';
import { WeeklyManagerScore } from '@/components/WeeklyManagerScore';
import { AIChangelog } from '@/components/AIChangelog';
import { VelocityAISidebar } from '@/components/dashboard/VelocityAISidebar';

interface AgentStats {
  totalSuggestions: number;
  approvedSuggestions: number;
  pendingSuggestions: number;
  lastSyncedAt: string | null;
  topMatchedMembers: { name: string; count: number }[];
  thisWeekSuggestions: number;
}

// LiveMeetingAssistant added to Agent page only

export default function AgentDashboard() {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const orgId = getCurrentOrgId();
      if (!orgId) return;

      try {
        const { data: suggestions } = await supabase
          .from('ai_task_suggestions')
          .select('id, status, suggested_user_id, created_at, users(name)')
          .order('created_at', { ascending: false });

        const all = suggestions || [];
        const approved = all.filter(s => s.status === 'approved').length;
        const pending = all.filter(s => s.status === 'pending').length;

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const thisWeek = all.filter(s => new Date(s.created_at) > weekAgo).length;

        const memberCounts: Record<string, { name: string; count: number }> = {};
        all.forEach(s => {
          if (s.suggested_user_id && (s as any).users?.name) {
            const name = (s as any).users.name;
            if (!memberCounts[s.suggested_user_id]) {
              memberCounts[s.suggested_user_id] = { name, count: 0 };
            }
            memberCounts[s.suggested_user_id].count++;
          }
        });
        const topMembers = Object.values(memberCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        const lastSync = all.length > 0 ? all[0].created_at : null;

        setStats({
          totalSuggestions: all.length,
          approvedSuggestions: approved,
          pendingSuggestions: pending,
          lastSyncedAt: lastSync,
          topMatchedMembers: topMembers,
          thisWeekSuggestions: thisWeek,
        });
      } catch (e) {
        console.error('AgentDashboard load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading)
    return (
      <VelocityAISidebar>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
        <LiveMeetingAssistant />
</VelocityAISidebar>
    );

  if (!stats) return null;

  const approvalRate =
    stats.totalSuggestions > 0
      ? Math.round((stats.approvedSuggestions / stats.totalSuggestions) * 100)
      : 0;

  return (
    <VelocityAISidebar>
      <div className="p-8 max-w-5xl mx-auto min-h-screen bg-[#FAFAF9]">
        <div className="mb-8">
          <h1 className="text-2xl font-light text-gray-900 mb-1">Agent Intelligence</h1>
          <p className="text-gray-500 text-sm font-light">
            AI-powered insights, predictions, and automation for your team
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                This Week
              </p>
            </div>
            <p className="text-3xl font-light text-gray-900">
              {stats.thisWeekSuggestions}
            </p>
            <p className="text-xs text-gray-400 mt-1">tasks extracted</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Approved
              </p>
            </div>
            <p className="text-3xl font-light text-gray-900">
              {stats.approvedSuggestions}
            </p>
            <p className="text-xs text-gray-400 mt-1">{approvalRate}% approval rate</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-yellow-600" />
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Pending
              </p>
            </div>
            <p className="text-3xl font-light text-gray-900">
              {stats.pendingSuggestions}
            </p>
            <p className="text-xs text-gray-400 mt-1">awaiting review</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4 text-primary" />
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Last Sync
              </p>
            </div>
            <p className="text-sm font-light text-gray-900">
              {stats.lastSyncedAt
                ? new Date(stats.lastSyncedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Google Workspace</p>
          </div>
        </div>

        {/* Approval Rate Bar */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-900 mb-4">
            Overall Approval Rate
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${approvalRate}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-900 w-12 text-right">
              {approvalRate}%
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {stats.approvedSuggestions} approved out of {stats.totalSuggestions} total
            suggestions
          </p>
        </div>

        {/* Top Matched Members */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-gray-900">
              Most Frequently Matched Members
            </h2>
          </div>
          {stats.topMatchedMembers.length === 0 ? (
            <p className="text-sm text-gray-400">
              No data yet — sync your Google Workspace to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.topMatchedMembers.map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center flex-shrink-0">
                    {m.name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-light text-gray-900">{m.name}</span>
                      <span className="text-xs text-gray-500">{m.count} times</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{
                          width: `${Math.min(
                            (m.count / (stats.topMatchedMembers[0]?.count || 1)) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Accuracy Tracker */}
        <div className="mt-6">
          <AccuracyTracker />
        </div>

        {/* Workload Rebalancer */}
        <div className="mt-6">
          <WorkloadRebalancer />
        </div>

        {/* Stakeholder Update Generator */}
        <div className="mt-6">
          <StakeholderUpdate />
        </div>

        {/* Scope Estimator — standalone */}
        <div className="mt-6">
          <ScopeEstimator />
        </div>

        {/* Project Post-Mortem AI — standalone */}
        <div className="mt-6">
          <RetroGenerator />
        </div>

        {/* Risk Heatmap */}
        <div className="mt-6">
          <RiskHeatmap />
        </div>

        {/* Predictive Hiring */}
        <div className="mt-6">
          <PredictiveHiring />
        </div>

        {/* Team DNA Report */}
        <div className="mt-6">
          <TeamDNAReport />
        </div>

        {/* Team Benchmarks */}
        <div className="mt-6">
          <TeamBenchmarks />
        </div>

        {/* Manager Report Card */}
        <div className="mt-6">
          <ManagerReportCard />
        </div>

        <div className="mt-6"><StaleTaskFlagging /></div>
        <div className="mt-6"><SprintRetroGenerator /></div>
        <div className="mt-6"><CapacityNegotiator /></div>
        <div className="mt-6"><EngineerGrowthTracker /></div>
        <div className="mt-6"><ProjectComplexityScore /></div>
        <div className="mt-6"><WeeklyManagerScore /></div>
        <div className="mt-6"><AIChangelog /></div>

        {/* Engineer Skill Graph */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-gray-900">Engineer Skill Graph</h2>
            <span className="text-xs text-gray-400 ml-1">
              — built from completed task history
            </span>
          </div>
          <SkillGraph />
        </div>
      </div>
      <LiveMeetingAssistant />
</VelocityAISidebar>
  );
}
