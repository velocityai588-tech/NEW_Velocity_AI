import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Briefcase, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface CandidateIn {
  id?: string;
  name: string;
  current_load?: number;
  skills?: string[];
  role_level?: string;
  avg_completion_time?: number;
  efficiency_score?: number;
  base_productive_hours?: number;
  pto_hours_this_week?: number;
  holiday_hours_this_week?: number;
}

interface CapacityResult {
  id: string;
  name: string;
  available_hours: number;
  base_productive_hours: number;
  efficiency_score: number;
  current_load: number;
  pto_hours_this_week: number;
  holiday_hours_this_week: number;
}

interface LeaveData {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

interface OrganizationalWorkloadTableProps {
  approvedLeaves?: LeaveData[];
  onLeaveRefresh?: () => void;
}

export const OrganizationalWorkloadTable: React.FC<OrganizationalWorkloadTableProps> = ({ approvedLeaves = [], onLeaveRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CapacityResult[]>([]);
  const [teamTotal, setTeamTotal] = useState<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Helper: Calculate business days between two dates
  const calculateBusinessDays = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count += 1;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  // Helper: Calculate total PTO hours for an employee from approved leaves
  const calculateEmployeePTO = (employeeName: string): number => {
    return approvedLeaves
      .filter(leave => leave.name === employeeName && leave.status === 'Approved')
      .reduce((total, leave) => {
        const businessDays = calculateBusinessDays(leave.startDate, leave.endDate);
        return total + (businessDays * 8); // 8 hours per business day
      }, 0);
  };

  // Listen for leave events to trigger refresh
  useEffect(() => {
    const handleLeaveApplied = () => {
      console.log('[Capacity Dashboard] Leave applied event received, refreshing...');
      setRefreshKey(prev => prev + 1);
    };

    const handleLeaveApproved = () => {
      console.log('[Capacity Dashboard] Leave approved event received, refreshing...');
      setRefreshKey(prev => prev + 1);
    };

    window.addEventListener('leaveApplied', handleLeaveApplied);
    window.addEventListener('leaveApproved', handleLeaveApproved);

    return () => {
      window.removeEventListener('leaveApplied', handleLeaveApplied);
      window.removeEventListener('leaveApproved', handleLeaveApproved);
    };
  }, []);

  const fetchCapacityData = async () => {
    // Fetch Jira projects then issues, aggregate by assignee, then call capacity API
    setLoading(true);
    setError(null);
    try {
      const projectsResp = await fetch('/api/jira/projects');
      if (projectsResp.status === 401) {
        setError('Not connected to Jira. Please connect your Jira account.');
        setLoading(false);
        return;
      }

      const projData = await projectsResp.json();
      const projects = projData.projects || [];

      // Fetch issues for all projects (max 100 per project as implemented server-side)
      const assigneeMap: Record<string, CandidateIn> = {};

      for (const p of projects) {
        try {
          const issuesResp = await fetch(`/api/jira/issues?projectKey=${encodeURIComponent(p.key)}`);
          if (!issuesResp.ok) continue;
          const issuesJson = await issuesResp.json();
          const issues = issuesJson.issues || [];

          for (const issue of issues) {
            const assignee = issue.assignee || 'Unassigned';
            const key = assignee || 'Unassigned';
            if (!assigneeMap[key]) {
              assigneeMap[key] = {
                id: key,
                name: assignee,
                current_load: 0,
                skills: [],
                efficiency_score: 1,
                base_productive_hours: 40,
                pto_hours_this_week: 0,
                holiday_hours_this_week: 0,
              };
            }

            // Sum time spent from worklog or timetracking if present
            const worklog = issue.worklog || [];
            let seconds = 0;
            if (Array.isArray(worklog)) {
              for (const w of worklog) {
                seconds += Number(w.timeSpentSeconds || 0);
              }
            }
            const timeSpentHours = seconds / 3600;
            assigneeMap[key].current_load = (assigneeMap[key].current_load || 0) + timeSpentHours;
          }
        } catch (e) {
          console.warn('Failed to fetch issues for project', p.key, e);
        }
      }

      const candidates = Object.values(assigneeMap);

      // Add PTO from approved leaves to each candidate
      const candidatesWithLeaves = candidates.map(candidate => ({
        ...candidate,
        pto_hours_this_week: (candidate.pto_hours_this_week || 0) + calculateEmployeePTO(candidate.name)
      }));

      // Determine API base (use local API during development to avoid proxy issues)
      // import.meta.env.DEV is available in Vite; fallback to checking host
      const DEV = typeof import.meta !== 'undefined' && !!(import.meta as any).env && (import.meta as any).env.DEV;
      let apiBase = DEV ? 'http://localhost:4000' : '';
      // Fallback: when running in the browser dev server (5173) but import.meta.env isn't available,
      // detect by window.location and point requests to the local backend.
      try {
        if (!apiBase && typeof window !== 'undefined') {
          const port = window.location.port || '';
          const host = window.location.hostname || '';
          if (port === '5173' || host === 'localhost' || host === '127.0.0.1') {
            apiBase = 'http://localhost:4000';
          }
        }
      } catch (e) {
        // ignore
      }

      // Call capacity API. Try primary path, then fallbacks if 404.
      const postTo = async (url: string) => {
        const full = url.startsWith('http') ? url : `${apiBase}${url}`;
        const r = await fetch(full, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidates: candidatesWithLeaves }),
        });
        return r;
      };

      let capResp = await postTo('/api/v1/analyze/capacity');
      if (capResp.status === 404) {
        console.warn('[Capacity UI] Primary path 404, trying fallback /api/index?_path=...');
        capResp = await postTo(`${apiBase}/api/index?_path=/api/v1/analyze/capacity`);
      }

      if (!capResp.ok) {
        const text = await capResp.text().catch(() => '');
        throw new Error(text || `Capacity API error (status ${capResp.status})`);
      }

      const capJson = await capResp.json();
      setTeamTotal(capJson.team_total || 0);
      setResults(capJson.results || []);
      setLoading(false);
    } catch (err: any) {
      console.error('[Capacity UI] Error:', err);
      // Fallback: compute capacity locally from candidates if API fails
      try {
        const localResults = candidatesWithLeaves.map((c: any) => {
          const base = Number(c.base_productive_hours ?? 40);
          const efficiency = Number(c.efficiency_score ?? 1);
          const currentLoad = Number(c.current_load ?? 0);
          const pto = Number(c.pto_hours_this_week ?? 0);
          const holiday = Number(c.holiday_hours_this_week ?? 0);
          const available = Math.max(0, Math.round((base * efficiency - currentLoad - pto - holiday) * 100) / 100);
          return {
            id: c.id ?? c.name,
            name: c.name ?? 'Unknown',
            base_productive_hours: base,
            efficiency_score: efficiency,
            current_load: currentLoad,
            pto_hours_this_week: pto,
            holiday_hours_this_week: holiday,
            available_hours: available,
          };
        });
        setResults(localResults);
        setTeamTotal(localResults.reduce((s, r) => s + (r.available_hours || 0), 0));
        setError(null);
      } catch (e) {
        setError(String(err.message || err));
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapacityData();
  }, [refreshKey, approvedLeaves]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <div className="p-2 bg-indigo-100 rounded-lg"><Briefcase className="w-5 h-5 text-indigo-700" /></div>
          Team Capacity (Jira)
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600">Total Available: <strong>{teamTotal}h</strong></div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto">
          {loading && <div className="p-6">Loading capacity from Jira...</div>}
          {error && <div className="p-6 text-rose-600">{error}</div>}
          {!loading && !error && (
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-left text-xs font-bold text-slate-500 uppercase">Employee</th>
                  <th className="p-4 text-center text-xs font-bold text-slate-500 uppercase">Base Hours</th>
                  <th className="p-4 text-center text-xs font-bold text-slate-500 uppercase">Current Load</th>
                  <th className="p-4 text-center text-xs font-bold text-slate-500 uppercase">PTO</th>
                  <th className="p-4 text-center text-xs font-bold text-slate-500 uppercase">Holiday</th>
                  <th className="p-4 text-center text-xs font-bold text-slate-500 uppercase">Available</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} className="border-b">
                    <td className="p-4 font-bold text-sm text-gray-800">{r.name}</td>
                    <td className="p-4 text-center text-sm text-slate-600">{r.base_productive_hours}</td>
                    <td className="p-4 text-center text-sm text-slate-600">{(r.current_load || 0).toFixed(1)}h</td>
                    <td className="p-4 text-center text-sm text-slate-600">{r.pto_hours_this_week}h</td>
                    <td className="p-4 text-center text-sm text-slate-600">{r.holiday_hours_this_week}h</td>
                    <td className="p-4 text-center font-bold text-indigo-700">{r.available_hours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};