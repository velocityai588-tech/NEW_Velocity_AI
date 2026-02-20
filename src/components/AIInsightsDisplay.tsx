import { AlertCircle, TrendingDown, Zap, Users, CheckCircle, Clock } from 'lucide-react';
import { AIInsightResponse } from '@/lib/aiInsightsService';

interface AIInsightsDisplayProps {
  insights: AIInsightResponse;
  loading?: boolean;
}

export const AIInsightsDisplay = ({ insights, loading }: AIInsightsDisplayProps) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-10 border border-gray-100 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
        <p className="text-gray-600 font-light">Analyzing team insights...</p>
      </div>
    );
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'overload':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'timeline_risk':
        return <Clock className="w-5 h-5 text-orange-500" />;
      case 'underutilization':
        return <TrendingDown className="w-5 h-5 text-blue-500" />;
      case 'skill_gap':
        return <Users className="w-5 h-5 text-purple-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-red-700 bg-red-50';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50';
      default:
        return 'text-green-700 bg-green-50';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Health Card */}
      <div className={`rounded-2xl shadow-sm p-8 border border-gray-100 ${insights.overall_health.status === 'healthy' ? 'bg-green-50 border-green-200' : insights.overall_health.status === 'warning' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-light text-gray-900">Team Health Assessment</h3>
          <div className={`px-4 py-2 rounded-full text-sm font-medium ${getHealthStatusColor(insights.overall_health.status)}`}>
            {insights.overall_health.status.toUpperCase()}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Health Score</p>
            <div className="text-5xl font-light text-gray-900 mb-2">{insights.overall_health.score}</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  insights.overall_health.score >= 80 ? 'bg-green-500' :
                  insights.overall_health.score >= 60 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${insights.overall_health.score}%` }}
              ></div>
            </div>
          </div>
          
          <div className="flex items-center">
            <p className="text-gray-700 font-light text-lg leading-relaxed">{insights.overall_health.summary}</p>
          </div>
        </div>
      </div>

      {/* Insights Grid */}
      <div>
        <h3 className="text-xl font-light text-gray-900 mb-4">Key Insights</h3>
        
        {insights.insights.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 border border-green-200 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-700 font-light">No issues detected. Team is running smoothly!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.insights.map((insight, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-6 border-2 transition-all ${getSeverityColor(insight.severity)}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {getInsightIcon(insight.type)}
                  </div>
                  
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">{insight.title}</h4>
                    <p className="text-xs text-gray-700 mb-3 leading-relaxed">{insight.description}</p>
                    
                    {insight.affected_candidates && insight.affected_candidates.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-600 mb-1">Affected People:</p>
                        <div className="flex flex-wrap gap-1">
                          {insight.affected_candidates.map((name, i) => (
                            <span
                              key={i}
                              className="inline-block px-2 py-1 bg-gray-200 rounded text-xs font-light"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {insight.recommendation && (
                      <div className="pt-3 border-t border-current border-opacity-20">
                        <p className="text-xs font-medium text-gray-700">💡 Recommendation:</p>
                        <p className="text-xs text-gray-700 mt-1 font-light">{insight.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metrics Summary */}
      {insights.insights.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 font-light mb-2">Tasks in Progress</p>
            <p className="text-2xl font-light text-gray-900">
              {insights.insights[0]?.metrics?.tasks_in_progress ?? 'N/A'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 font-light mb-2">Overdue Tasks</p>
            <p className="text-2xl font-light text-red-600">
              {insights.insights[0]?.metrics?.overdue_tasks ?? 'N/A'}
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-600 font-light mb-2">Total Candidates</p>
            <p className="text-2xl font-light text-gray-900">
              {insights.insights[0]?.metrics?.total_candidates ?? 'N/A'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
