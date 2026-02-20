import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, TrendingDown, Zap } from 'lucide-react';
import { fetchTeamCapacity, type CapacityCandidate, type CapacityAnalysis } from '@/lib/capacityService';

interface TeamCapacityPanelProps {
  candidates: CapacityCandidate[];
  refreshTrigger?: number;
}

const statusConfig = {
  available: { color: 'bg-green-50 border-green-200', icon: CheckCircle, label: '✓ Available', textColor: 'text-green-700' },
  busy: { color: 'bg-yellow-50 border-yellow-200', icon: Clock, label: '⚡ Busy', textColor: 'text-yellow-700' },
  pto: { color: 'bg-blue-50 border-blue-200', icon: TrendingDown, label: '📅 PTO', textColor: 'text-blue-700' },
  holiday: { color: 'bg-purple-50 border-purple-200', icon: TrendingDown, label: '🎉 Holiday', textColor: 'text-purple-700' },
  overbooked: { color: 'bg-red-50 border-red-200', icon: AlertCircle, label: '⚠️ Overbooked', textColor: 'text-red-700' },
};

export const TeamCapacityPanel: React.FC<TeamCapacityPanelProps> = ({ candidates, refreshTrigger }) => {
  const [capacities, setCapacities] = useState<CapacityAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const analyzeCapacity = async () => {
      if (candidates.length === 0) {
        setCapacities([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await fetchTeamCapacity(candidates);
        if (result) {
          setCapacities(result);
        } else {
          setError('Failed to load capacity data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    analyzeCapacity();
  }, [candidates, refreshTrigger]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block">
          <div className="animate-spin h-6 w-6 text-indigo-600 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
        <p className="mt-2 text-sm text-slate-600">Analyzing team capacity...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-red-900">Capacity Analysis Error</h4>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (capacities.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No team members available for analysis</p>
      </div>
    );
  }

  // Calculate team metrics
  const totalBase = capacities.reduce((sum, c) => sum + c.base_productive_hours, 0);
  const totalAvailable = capacities.reduce((sum, c) => sum + c.net_available_hours, 0);
  const avgUtilization = capacities.length > 0 
    ? Math.round(capacities.reduce((sum, c) => sum + (c.utilization_percent || 0), 0) / capacities.length)
    : 0;

  const availableCount = capacities.filter(c => c.status === 'available').length;
  const busyCount = capacities.filter(c => c.status === 'busy').length;
  const ptoCount = capacities.filter(c => c.status === 'pto').length;
  const overbookedCount = capacities.filter(c => c.status === 'overbooked').length;

  return (
    <div className="space-y-6">
      {/* Team Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-green-700 uppercase">Available</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{availableCount}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600 opacity-30" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-yellow-700 uppercase">Busy</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">{busyCount}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600 opacity-30" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-blue-700 uppercase">PTO/Holiday</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{ptoCount}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-blue-600 opacity-30" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-700 uppercase">Overbooked</p>
              <p className="text-2xl font-bold text-red-900 mt-1">{overbookedCount}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-600 opacity-30" />
          </div>
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900">Team Capacity</h4>
          <span className="text-sm font-bold text-slate-700">
            {totalAvailable} / {totalBase} hours available
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (totalAvailable / totalBase) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-2">
          Team utilization: {avgUtilization}%
        </p>
      </div>

      {/* Team Members Grid */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Team Capacity Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
          {capacities.map((capacity) => {
            const config = statusConfig[capacity.status];
            const Icon = config.icon;
            const utilPercent = capacity.utilization_percent || 0;

            return (
              <div key={capacity.employee_id} className={`border-2 rounded-lg p-4 ${config.color} transition-all`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{capacity.name}</p>
                    <p className={`text-xs font-medium ${config.textColor}`}>{config.label}</p>
                  </div>
                  <Icon className={`w-5 h-5 ${config.textColor}`} />
                </div>

                <div className="space-y-1 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>Base Hours:</span>
                    <span className="font-medium">{capacity.base_productive_hours}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PTO:</span>
                    <span className="font-medium">-{capacity.pto_hours_this_week}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Holiday:</span>
                    <span className="font-medium">-{capacity.holiday_hours_this_week}h</span>
                  </div>
                  <div className="border-t border-slate-300 pt-1 mt-1 flex justify-between font-bold text-slate-900">
                    <span>Available:</span>
                    <span className="text-indigo-600">{capacity.net_available_hours}h</span>
                  </div>
                </div>

                {/* Utilization Bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600">Utilization</span>
                    <span className="font-semibold text-slate-700">{utilPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-300 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        utilPercent > 90 ? 'bg-red-500' : 
                        utilPercent > 70 ? 'bg-yellow-500' : 
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, utilPercent)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
