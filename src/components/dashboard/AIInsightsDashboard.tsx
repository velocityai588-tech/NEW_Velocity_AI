import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  TrendingUp,
  Zap,
  BarChart3,
  Target,
  Activity,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { fetchAIInsights, transformJiraDataToAIInsights } from '@/lib/aiInsightsService';
import { useJiraData } from '@/hooks/useJiraData';

// ==================== SHARED COMPONENTS ====================

const KPICard = ({ label, value, sublabel, icon, trend }: any) => (
  <div className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow duration-400 border border-gray-100">
    <div className="text-4xl font-light text-gray-900 mb-3 tracking-tight">{value}</div>
    <div className="text-sm text-gray-500 font-light mb-1">{label}</div>
    {sublabel && <div className="text-xs text-gray-400 font-light">{sublabel}</div>}
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<string, string> = {
    'Active': 'bg-blue-50 text-blue-700',
    'At Risk': 'bg-amber-50 text-amber-700',
    'Delayed': 'bg-rose-50 text-rose-700',
    'Completed': 'bg-emerald-50 text-emerald-700',
    'Healthy': 'bg-emerald-50 text-emerald-700',
    'Overloaded': 'bg-rose-50 text-rose-700',
    'Not Started': 'bg-gray-50 text-gray-600',
    'In Progress': 'bg-blue-50 text-blue-700',
    'Pending': 'bg-amber-50 text-amber-700',
    'Approved': 'bg-emerald-50 text-emerald-700',
    'Denied': 'bg-rose-50 text-rose-700',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-light ${variants[status] || 'bg-gray-50 text-gray-700'}`}>
      {status}
    </span>
  );
};

const UtilizationBar = ({ value }: { value: number }) => {
  const color = value > 110 ? 'bg-rose-400' : value > 90 ? 'bg-amber-400' : 'bg-blue-400';
  const width = Math.min(value, 150);

  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full ${color} transition-all duration-500`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
};

const HealthIndicator = ({ score }: { score: number }) => {
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600';
  const bgColor = score >= 80 ? 'bg-emerald-50' : score >= 60 ? 'bg-amber-50' : 'bg-rose-50';

  return (
    <div className="flex items-center gap-3">
      <div className={`w-14 h-14 rounded-2xl ${bgColor} flex items-center justify-center`}>
        <span className={`text-xl font-light ${color}`}>{score}</span>
      </div>
    </div>
  );
};

const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div className="flex items-center gap-2">
      <div className="bg-blue-600 rounded-xl p-2">
        <Zap className="w-5 h-5 text-white" />
      </div>
      <span className={`font-medium text-gray-900 ${sizes[size]}`}>Velocity AI</span>
    </div>
  );
};

// ==================== MAIN DASHBOARD COMPONENT ====================

export const AIInsightsDashboard = () => {
  const [timeframe, setTimeframe] = useState<'1' | '2' | '4' | '8'>('8');
  const [insights, setInsights] = useState<any[]>([]);
  const [overallHealth, setOverallHealth] = useState('healthy');
  const [priorityActions, setPriorityActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const { jiraIssues, employees } = useJiraData();

  // Fetch AI Insights on component mount or when data changes
  useEffect(() => {
    const loadInsights = async () => {
      try {
        setLoading(true);
        if (!jiraIssues?.length || !employees?.length) {
          console.log('[Dashboard] Waiting for Jira data...');
          setLoading(false);
          return;
        }

        console.log('[Dashboard] Loading AI Insights with', employees.length, 'employees');

        // Transform Jira data to AI Insights request format
        const request = transformJiraDataToAIInsights(jiraIssues, employees);
        
        // Fetch insights from API
        const response = await fetchAIInsights(request);
        
        if (response) {
          setInsights(response.insights || []);
          setOverallHealth(response.overall_health?.status || 'healthy');
          setPriorityActions(response.overall_health?.summary ? [response.overall_health.summary] : []);
          console.log('[Dashboard] Received', response.insights?.length, 'insights');
        } else {
          console.error('[Dashboard] Failed to fetch insights');
        }
      } catch (error) {
        console.error('[Dashboard] Error loading insights:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInsights();
  }, [jiraIssues, employees]);

  // Generate capacity data based on timeframe
  const generateCapacityData = (weeks: number) => {
    const data = [];
    for (let i = 1; i <= weeks; i++) {
      data.push({
        week: `Week ${i}`,
        utilization: Math.round(Math.random() * 40 + 70),
        available: Math.round(Math.random() * 120 + 40),
      });
    }
    return data;
  };

  const capacityData = generateCapacityData(parseInt(timeframe));

  const upcomingDeadlines = [
    { project: 'Velocity AI Platform Redesign', deadline: 'Mar 30, 2026', daysLeft: 44, status: 'At Risk' },
    { project: 'Mobile App MVP', deadline: 'Mar 15, 2026', daysLeft: 29, status: 'Active' },
    { project: 'API Documentation', deadline: 'Feb 28, 2026', daysLeft: 14, status: 'Active' },
  ];

  return (
    <div className="p-12 bg-gray-50 min-h-screen">
      <div className="max-w-[1600px] mx-auto">
        <h1 className="text-4xl font-light text-gray-900 mb-12 tracking-tight">Dashboard</h1>

        <div className="grid grid-cols-12 gap-10">
          {/* Main Content - 8 columns */}
          <div className="col-span-8 space-y-12">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-6">
              <KPICard label="Active Projects" value="12" />
              <KPICard label="Team Utilization" value="87%" sublabel="Within target" />
              <KPICard label="Available Capacity" value="312h" sublabel="Next 2 weeks" />
              <KPICard label="Projects at Risk" value="3" />
            </div>

            {/* Capacity Overview Chart */}
            <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-light text-gray-900">Capacity Overview - Hours Left & Utilization</h2>
                <div className="flex gap-2">
                  {(['1', '2', '4', '8'] as const).map((weeks) => (
                    <button
                      key={weeks}
                      onClick={() => setTimeframe(weeks)}
                      className={`px-4 py-2 rounded-lg text-sm font-light transition-all ${
                        timeframe === weeks
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {weeks}W
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={capacityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontWeight: '300',
                    }}
                  />
                  <Bar dataKey="utilization" fill="#93c5fd" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="available" fill="#e5e7eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="flex items-center justify-center gap-8 mt-6">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-blue-300 rounded-full"></div>
                  <span className="text-xs text-gray-500 font-light">Utilization %</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-gray-300 rounded-full"></div>
                  <span className="text-xs text-gray-500 font-light">Available Hours</span>
                </div>
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100">
              <h2 className="text-xl font-light text-gray-900 mb-8">Upcoming Deadlines</h2>

              <div className="space-y-4">
                {upcomingDeadlines.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-5 px-6 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-colors duration-300 cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="text-gray-900 text-sm mb-1.5 font-light">{item.project}</div>
                      <div className="text-xs text-gray-400 font-light">{item.deadline}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm text-gray-900 font-light">{item.daysLeft} days</div>
                        <div className="text-xs text-gray-400 font-light">remaining</div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Recommendations Panel - 4 columns */}
          <div className="col-span-4">
            <div className="bg-white rounded-2xl p-8 shadow-sm sticky top-28 border border-gray-100">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-light text-gray-900">AI Insights</h2>
                {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="text-center">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500 font-light">Loading AI insights...</p>
                  </div>
                </div>
              ) : insights.length > 0 ? (
                <div className="space-y-4">
                  {/* Health Badge */}
                  <div className="mb-6 pb-6 border-b border-gray-100">
                    <div className="inline-block">
                      <span className={`text-xs font-light px-3 py-1.5 rounded-full ${
                        overallHealth === 'critical' ? 'bg-rose-50 text-rose-700' :
                        overallHealth === 'at_risk' ? 'bg-amber-50 text-amber-700' :
                        'bg-emerald-50 text-emerald-700'
                      }`}>
                        Team Health: {overallHealth === 'critical' ? '🚨 Critical' : overallHealth === 'at_risk' ? '⚠️ At Risk' : '✓ Healthy'}
                      </span>
                    </div>
                  </div>

                  {/* Insights List */}
                  {insights.map((insight, idx) => {
                    const severityColors: Record<string, string> = {
                      critical: 'bg-rose-50 border-l-4 border-rose-400',
                      high: 'bg-amber-50 border-l-4 border-amber-400',
                      medium: 'bg-blue-50 border-l-4 border-blue-400',
                      low: 'bg-emerald-50 border-l-4 border-emerald-400',
                    };

                    const severityDots: Record<string, string> = {
                      critical: 'bg-rose-400',
                      high: 'bg-amber-400',
                      medium: 'bg-blue-400',
                      low: 'bg-emerald-400',
                    };

                    return (
                      <div key={idx} className={`p-4 rounded-lg ${severityColors[insight.severity] || severityColors.low}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${severityDots[insight.severity] || severityDots.low}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 mb-1">{insight.description}</div>
                            {insight.recommendation && (
                              <div className="text-xs text-gray-600 leading-relaxed">
                                <strong>Action:</strong> {insight.recommendation}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Priority Actions */}
                  {priorityActions.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <h3 className="text-xs font-medium text-gray-900 mb-3 uppercase">Priority Actions</h3>
                      <ul className="space-y-2">
                        {priorityActions.map((action, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-gray-600">
                            <ChevronRight className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="text-sm text-gray-600 font-light">No significant issues detected</p>
                  <p className="text-xs text-gray-400 font-light mt-1">Team is running smoothly</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIInsightsDashboard;
