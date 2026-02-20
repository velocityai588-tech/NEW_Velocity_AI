import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, TrendingDown, Clock } from 'lucide-react';
import { fetchPTOImpact, type Task, type Candidate, type PTOImpactResponse } from '@/lib/ptoCaculatorService';

interface PTOImpactPanelProps {
  task: Task;
  candidates: Candidate[];
  startDate: string;
  onRecommendedChange?: (candidateId: string) => void;
}

export const PTOImpactPanel: React.FC<PTOImpactPanelProps> = ({ 
  task, 
  candidates, 
  startDate,
  onRecommendedChange 
}) => {
  const [impact, setImpact] = useState<PTOImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const analyzeImpact = async () => {
      if (!task.title || candidates.length === 0) {
        setImpact(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await fetchPTOImpact(task, candidates, startDate);
        if (result) {
          setImpact(result);
          if (onRecommendedChange) {
            onRecommendedChange(result.recommended_candidate_id);
          }
        } else {
          setError('Failed to calculate PTO impact');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    analyzeImpact();
  }, [task, candidates, startDate, onRecommendedChange]);

  if (!impact) return null;

  const recommended = impact.impact_analysis.find(a => a.employee_id === impact.recommended_candidate_id);

  return (
    <div className="space-y-4">
      {/* Deferral Warning */}
      {impact.deferral_recommendation && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-amber-900">Consider Deferring Task</h4>
            <p className="text-sm text-amber-800 mt-1">
              Based on current PTO schedules and workload, it may be better to defer this task to a later date.
            </p>
          </div>
        </div>
      )}

      {/* Recommended Candidate Highlight */}
      {recommended && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-blue-900">Recommended Assignment</h4>
            <div className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-medium">
              {Math.round(recommended.task_completion_probability * 100)}% Success Rate
            </div>
          </div>
          
          <div className="bg-white rounded p-3 space-y-2">
            <div>
              <p className="text-sm font-medium text-gray-700">{recommended.name}</p>
              <p className="text-xs text-gray-500">{task.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <p className="text-xs text-gray-500 uppercase">Available After PTO</p>
                <p className="text-lg font-bold text-gray-900">{recommended.net_available_after_pto}h</p>
              </div>
              {recommended.timeline_impact_days > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">Timeline Impact</p>
                  <p className="text-lg font-bold text-amber-600">+{recommended.timeline_impact_days}d</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Impact Analysis Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h4 className="font-semibold text-gray-900 text-sm">Detailed Analysis</h4>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {impact.impact_analysis.map((analysis, idx) => (
            <div
              key={analysis.employee_id}
              className={`p-3 rounded border transition-colors ${
                analysis.employee_id === impact.recommended_candidate_id
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{analysis.name}</p>
                  <p className="text-xs text-gray-500">
                    {analysis.employee_id === impact.recommended_candidate_id && '⭐ Recommended'}
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  {analysis.task_completion_probability >= 0.7 ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : analysis.task_completion_probability >= 0.4 ? (
                    <TrendingDown className="w-4 h-4 text-amber-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="text-sm font-bold">
                    {Math.round(analysis.task_completion_probability * 100)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <p className="text-gray-500">Initial Available</p>
                  <p className="font-medium text-gray-900">{analysis.initial_available_hours}h</p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500">PTO Deduction</p>
                  <p className="font-medium text-amber-600">-{analysis.pto_deduction_hours}h</p>
                </div>
                <div className="space-y-1">
                  <p className="text-gray-500">Net Available</p>
                  <p className="font-medium text-gray-900">{analysis.net_available_after_pto}h</p>
                </div>
                {analysis.timeline_impact_days > 0 && (
                  <div className="space-y-1">
                    <p className="text-gray-500">Timeline Impact</p>
                    <p className="font-medium text-amber-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      +{analysis.timeline_impact_days}d
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-gray-600">Analyzing PTO impact...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
};
