import React, { useState } from 'react';
import { getDashboardData } from '@/services/dashboardService';
import { Calculator, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface NegotiationResult {
  canTakeOn: boolean;
  currentUtilization: number;
  availableHours: number;
  projectedUtilization: number;
  membersWithRoom: { name: string; hours: number }[];
  whatWouldSlip: string[];
  recommendation: string;
}

export const CapacityNegotiator: React.FC = () => {
  const [projectHours, setProjectHours] = useState('');
  const [projectName, setProjectName] = useState('');
  const [result, setResult] = useState<NegotiationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCheck = async () => {
    const hours = parseInt(projectHours);
    if (!hours || hours <= 0) return;
    setLoading(true);
    try {
      const dashData = (await getDashboardData()) as any;

      const capacityKpi = dashData?.kpis?.find((k: any) => k.label === 'AVAILABLE CAPACITY');
      const utilizationKpi = dashData?.kpis?.find((k: any) => k.label === 'TEAM UTILIZATION');
      const atRiskKpi = dashData?.kpis?.find((k: any) => k.label === 'PROJECTS AT RISK');

      const availableHours = parseInt(capacityKpi?.value?.replace('h', '') || '0');
      const currentUtilization = parseInt(utilizationKpi?.value?.replace('%', '') || '0');
      const atRisk = parseInt(atRiskKpi?.value || '0');

      // Can we take it on?
      const canTakeOn = availableHours >= hours;

      // Projected utilization after adding project
      const totalCapacity = availableHours / Math.max(1, (100 - currentUtilization) / 100);
      const projectedUtilization = Math.min(100, Math.round(
        ((totalCapacity - availableHours + hours) / totalCapacity) * 100
      ));

      // What would slip — from gantt data
      const whatWouldSlip: string[] = [];
      if (!canTakeOn && dashData?.deadlines) {
        dashData.deadlines.slice(0, 3).forEach((d: any) => {
          whatWouldSlip.push(d.project);
        });
      }

      // Members with room — from gantt
      const membersWithRoom: { name: string; hours: number }[] = [];
      if (dashData?.gantt) {
        dashData.gantt.forEach((member: any) => {
          const taskCount = member.tasks?.length || 0;
          if (taskCount < 4) {
            membersWithRoom.push({
              name: member.name,
              hours: Math.max(0, 40 - taskCount * 8),
            });
          }
        });
      }

      // Recommendation
      let recommendation = '';
      if (canTakeOn && projectedUtilization < 85) {
        recommendation = `✓ Yes — your team can absorb this. ${availableHours - hours}h will remain after this project.`;
      } else if (canTakeOn && projectedUtilization >= 85) {
        recommendation = `⚠ Possible but tight — utilization will hit ${projectedUtilization}%. Consider pushing a lower-priority project.`;
      } else {
        recommendation = `✗ Not recommended — you're ${hours - availableHours}h short. Either delay this project or descope ${atRisk} at-risk projects first.`;
      }

      setResult({
        canTakeOn,
        currentUtilization,
        availableHours,
        projectedUtilization,
        membersWithRoom: membersWithRoom.slice(0, 4),
        whatWouldSlip,
        recommendation,
      });
      setExpanded(true);
    } catch (e) {
      console.error('CapacityNegotiator error:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
        <Calculator className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-gray-900">Capacity Negotiator</h3>
        <span className="text-xs text-gray-400 ml-1">— "Can we take this on?"</span>
      </div>

      <div className="p-5 space-y-3">
        <input
          value={projectName}
          onChange={e => { setProjectName(e.target.value); setResult(null); }}
          placeholder="Project name (optional)"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm placeholder-gray-300"
        />
        <div className="flex gap-2">
          <input
            type="number"
            value={projectHours}
            onChange={e => { setProjectHours(e.target.value); setResult(null); }}
            placeholder="Estimated hours needed"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm placeholder-gray-300"
            min="1"
          />
          <button
            onClick={result ? () => setExpanded(!expanded) : handleCheck}
            disabled={loading || !projectHours}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : result ? (
              expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
            ) : (
              <Calculator className="w-4 h-4" />
            )}
            {loading ? '…' : result ? 'Result' : 'Check'}
          </button>
        </div>

        {expanded && result && (
          <div className="space-y-3 pt-1">
            {/* Recommendation banner */}
            <div className={`p-3 rounded-xl text-sm font-medium ${
              result.canTakeOn && result.projectedUtilization < 85
                ? 'bg-teal-50 text-[#0F766E] border border-teal-100'
                : result.canTakeOn
                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                : 'bg-red-50 text-red-700 border border-red-100'
            }`}>
              {result.recommendation}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Current utilization', value: `${result.currentUtilization}%` },
                { label: 'Available now', value: `${result.availableHours}h` },
                { label: 'After this project', value: `${result.projectedUtilization}%` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className="text-lg font-light text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Members with room */}
            {result.membersWithRoom.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Team members with capacity:</p>
                <div className="flex flex-wrap gap-2">
                  {result.membersWithRoom.map(m => (
                    <span key={m.name} className="text-xs px-2.5 py-1 bg-teal-50 text-[#0F766E] rounded-full border border-teal-100">
                      {m.name} — {m.hours}h free
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* What would slip */}
            {result.whatWouldSlip.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Projects that would slip:</p>
                <div className="flex flex-wrap gap-2">
                  {result.whatWouldSlip.map(p => (
                    <span key={p} className="text-xs px-2.5 py-1 bg-red-50 text-red-600 rounded-full border border-red-100">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
