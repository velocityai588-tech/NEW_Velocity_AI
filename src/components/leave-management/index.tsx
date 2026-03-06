import React, { useState, useEffect } from 'react';
import { Users, Zap, AlertCircle, Database, RefreshCw, CalendarDays, Clock, Briefcase, ChevronLeft, ChevronRight, X } from 'lucide-react'; 
import { Button } from '../ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';

// Supabase and Auth
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Imports from your existing structure
import { Task, LeaveRequest, EmployeeProfile } from './types';
import { ImpactAnalysisDialog } from './ImpactAnalysisDialog';
import { LeaveApplicationDialog } from './LeaveApplicationDialog';
import { EmployeeLeavePortal } from './EmployeeLeavePortal';
import { CapacityAnalysis } from './CapacityAnalysis';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

// NEW: Import the normalized data fetching hook
import { useLeaveManagementData } from '@/hooks/useLeaveManagementData';

export default function LeaveManagementTab() {
  const { toast } = useToast();
  
  // NEW: Use the centralized data fetching hook instead of managing state directly
  const {
    tasks,
    employees,
    leaves,
    currentUser,
    currentOrgId,
    isLoading: isLoadingData,
    error: dataError,
    dataSource,
    refreshLeaves,
    addLeaveRequest,
  } = useLeaveManagementData();

  const { user, loading: authLoading } = useAuth();

  // UI state - separate from data fetching
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [redeployOpen, setRedeployOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [affectedTasksForShift, setAffectedTasksForShift] = useState<Task[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [expandedLeaves, setExpandedLeaves] = useState<Record<string, boolean>>({});
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Calendar state for month navigation
  const [overviewStartDate, setOverviewStartDate] = useState(new Date());
  
  // Default to manager view to show calendar
  const [activePersona, setActivePersona] = useState<'manager' | 'employee'>('manager');

  // ------------------------------------------------------------------
  // HARDENED SUBMISSION & MANAGER ACTIONS
  // ------------------------------------------------------------------
  const handleApplyLeave = async (request: Omit<LeaveRequest, 'id' | 'status'>) => {
    try {
      const employeeName = (request as any).employeeName || request.name;
      
      if (!employeeName || !currentOrgId) {
        toast({ title: "❌ Error", description: "Missing user or organization data.", variant: "destructive" });
        return;
      }

      await addLeaveRequest(request);
      toast({ title: "✅ Success", description: `Leave request submitted.` });
    } catch (err: any) {
      toast({ title: "❌ Submission Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleApproveLeave = async (leave: LeaveRequest) => {
    try {
      const actor = currentUser || 'Manager';
      const entry = { ts: new Date().toISOString(), actor, action: 'Approved', details: 'Manual Approval' };

      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved' })
        .eq('id', leave.id);
      
      if (error) throw error;
      await refreshLeaves();
      setShowSuccessBanner(true);
      setTimeout(() => setShowSuccessBanner(false), 5000);
      toast({ title: "✅ Approved", description: "Leave status updated." });
    } catch (err: any) {
      toast({ title: "❌ Approval Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRejectLeave = async (leave: LeaveRequest) => {
    try {
      const actor = currentUser || 'Manager';
      const entry = { ts: new Date().toISOString(), actor, action: 'Rejected', details: 'Request Denied' };

      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'rejected' })
        .eq('id', leave.id);
      
      if (error) throw error;
      await refreshLeaves();
      toast({ title: "❌ Rejected", description: "Leave request denied." });
    } catch (err: any) {
      toast({ title: "❌ Rejection Failed", description: err.message, variant: "destructive" });
    }
  };

  const getAvailableEmployeesOnDate = (date: string): { name: string; load: number }[] => {
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    return employees
      .map(emp => {
        const empTasks = tasks.filter(t => {
          if (t.assignee !== emp.name || t.isCancelled) return false;
          // Use due_date to determine if task is active on this date
          const taskDueStr = t.due_date || t.created_date;
          if (!taskDueStr) return false;
          
          const taskDueDate = new Date(taskDueStr);
          if (isNaN(taskDueDate.getTime())) return false;
          
          // Task is active on this date if due is on or after this date
          // and it's not more than 14 days in the future (reasonable planning window)
          const daysFromNow = (taskDueDate.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24);
          return daysFromNow >= -3 && daysFromNow <= 14;
        });
        const currentLoad = empTasks.reduce((sum, t) => sum + (t.hours / 8), 0) * 20; 
        return { name: emp.name, load: Math.min(100, currentLoad) };
      })
      .filter(emp => emp.load < 80) 
      .sort((a, b) => a.load - b.load); 
  };

  const handleRedeploy = (selectedEmployee: string) => {
    if (!selectedLeave) return;
    handleApproveLeave(selectedLeave);
    setRedeployOpen(false);
    setSelectedLeave(null);
    toast({ title: "✅ Complete", description: `Tasks redeployed to ${selectedEmployee} and leave approved.` });
  };

  const handleShiftTasks = (leave: LeaveRequest) => {
    const lStart = new Date(leave.startDate); 
    lStart.setHours(0,0,0,0);
    const lEnd = new Date(leave.endDate); 
    lEnd.setHours(23,59,59,999);
    
    const affectedForShift = tasks.filter(t => {
      if (t.assignee !== leave.name || t.isCancelled) return false;
      
      // Use due_date (when task needs to be complete) instead of created_date
      const taskDueStr = t.due_date || t.created_date;
      if (!taskDueStr) return false;
      
      const taskDueDate = new Date(taskDueStr);
      if (isNaN(taskDueDate.getTime())) return false;
      
      // Task is affected if it's due within 3 days before leave or within 14 days during/after leave
      const daysSinceLeavStart = (taskDueDate.getTime() - lStart.getTime()) / (1000 * 60 * 60 * 24);
      const daysBeforeLeavStart = (lStart.getTime() - taskDueDate.getTime()) / (1000 * 60 * 60 * 24);
      
      return daysBeforeLeavStart <= 3 && daysSinceLeavStart <= 14;
    });
    
    setAffectedTasksForShift(affectedForShift);
    setSelectedLeave(leave);
    setShiftOpen(true);
  };

  const performShiftTasks = async (leave: LeaveRequest) => {
    try {
      const durationDays = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (86400000)) + 1;
      
      const response = await fetch('/api/leave-approval/approve-and-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: leave.id,
          org_id: currentOrgId,
          name: leave.name,
          startDate: leave.startDate,
          endDate: leave.endDate,
          reason: leave.reason,
          status: leave.status
        })
      });

      if (!response.ok) throw new Error(`Backend error: ${response.status}`);

      const result = await response.json();
      const shiftsCount = result.data?.actions?.shifted || affectedTasksForShift.length;

      // Refresh data from backend
      await refreshLeaves();

      toast({ title: "✅ Success", description: `Leave approved and ${shiftsCount} tasks shifted.` });
      setShiftOpen(false);
      setSelectedLeave(null);
      setAffectedTasksForShift([]);
    } catch (err: any) {
      toast({ title: "❌ Shift Failed", description: err.message, variant: "destructive" });
    }
  };

  // ------------------------------------------------------------------
  // MOVABLE MANAGER CALENDAR LOGIC
  // ------------------------------------------------------------------
  const handlePrevOverview = () => {
    const newDate = new Date(overviewStartDate);
    newDate.setDate(newDate.getDate() - 14); // Move back 2 weeks
    setOverviewStartDate(newDate);
  };

  const handleNextOverview = () => {
    const newDate = new Date(overviewStartDate);
    newDate.setDate(newDate.getDate() + 14); // Move forward 2 weeks
    setOverviewStartDate(newDate);
  };

  const handleResetOverview = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setOverviewStartDate(today);
  };

  const getOverviewDays = () => {
    const arr: { date: string; leaves: LeaveRequest[] }[] = [];
    const iteratorDate = new Date(overviewStartDate);
    iteratorDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const d = new Date(iteratorDate);
      d.setDate(iteratorDate.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayLeaves = leaves.filter(l => {
        if (l.status !== 'Approved') return false;
        const s = new Date(l.startDate); s.setHours(0,0,0,0);
        const e = new Date(l.endDate); e.setHours(23,59,59,999);
        const dd = new Date(dateStr); dd.setHours(0,0,0,0);
        return dd >= s && dd <= e;
      });
      arr.push({ date: dateStr, leaves: dayLeaves });
    }
    return arr;
  };

  // Don't block rendering - show content with fade-in instead
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <div className="text-slate-500 font-light">Logging in...</div>
      </div>
    );
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  if (!user && !isDevelopment) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="text-slate-700 font-light text-center">
          <p className="font-semibold">Not authenticated</p>
          <p className="text-sm text-slate-500">Please log in to access Leave Management</p>
        </div>
      </div>
    );
  }

  // SECURITY: Check for authorization errors (user not part of organization)
  if (dataError) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 p-8">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="text-slate-700 font-light text-center max-w-md">
          <p className="font-semibold">Access Denied</p>
          <p className="text-sm text-slate-600 mt-2">{dataError}</p>
          <p className="text-xs text-slate-500 mt-4">Please contact your organization administrator if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen h-full flex flex-col bg-[#FAFAF9] animate-in fade-in duration-500 pb-20 p-12">
      {/* Background Gradient Effect */}
      <div 
        className="absolute top-0 left-1/2 transform -translate-x-1/2 pointer-events-none z-0"
        style={{
          width: '800px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(120px)',
          opacity: 0.4,
        }}
      />

      <div className="max-w-[1600px] mx-auto relative z-10 w-full">
        {/* HEADER SECTION */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-light text-[#121212] tracking-tight">Leave Management</h1>
          <Button 
            onClick={() => setActivePersona(activePersona === 'manager' ? 'employee' : 'manager')}
            className="bg-[#121212] hover:bg-[#262626] h-11 px-6 rounded-xl font-light transition-all duration-300 text-white shadow-md"
          >
            {activePersona === 'manager' ? 'Request Leave' : 'Back to Overview'}
          </Button>
        </div>

        {/* SUCCESS BANNER */}
        {showSuccessBanner && (
          <div className="mb-8 p-5 bg-[#F4F4F5] rounded-2xl border-l-2 border-l-[#121212] flex items-center justify-between animate-in fade-in duration-300">
            <div className="text-sm text-[#121212] font-light">
              Capacity recalculated. Review recommendations.
            </div>
            <button 
              onClick={() => setShowSuccessBanner(false)}
              className="text-[#737373] hover:text-[#262626] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ACTIVE LEAVE REQUESTS SECTION - MANAGER VIEW ONLY */}
        {activePersona === 'manager' && (
          <div className="mb-10">
            <h2 className="text-xl font-light text-[#262626] mb-6">Active Leave Requests</h2>
            <div className="bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-[16px] shadow-sm overflow-hidden">
              {leaves.length === 0 ? (
                <div className="text-center p-12 text-[#737373] bg-[#F4F4F5] rounded-xl border border-dashed border-[#E5E5E5]">
                  <AlertCircle className="w-10 h-10 mx-auto text-[#A3A3A3] mb-3" />
                  <p className="font-light">No leave requests found.</p>
                  <p className="text-xs mt-1 font-light">Requests submitted by your team will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {leaves.map((leave) => {
                    // Calculate tasks that are actually affected by the leave period
                    const affectedTasks = tasks.filter(t => {
                      // Skip cancelled tasks first
                      if (t.isCancelled) return false;

                      // Check assignee match (case-insensitive, handle whitespace)
                      const taskAssigneeNorm = (t.assignee || '').toLowerCase().trim();
                      const leaveNameNorm = (leave.name || '').toLowerCase().trim();
                      
                      // Try exact match first, then fall back to partial name matching
                      const assigneeMatches = taskAssigneeNorm === leaveNameNorm || 
                                             taskAssigneeNorm.includes(leaveNameNorm) ||
                                             leaveNameNorm.includes(taskAssigneeNorm);
                      
                      if (!assigneeMatches) {
                        // Debug: log why this task was filtered out (only on first non-match)
                        if (t.id === tasks[0]?.id && tasks.length > 0) {
                          console.debug(`[LeaveMatching] Leave "${leave.name}" not matching task assignees:`, 
                            tasks.slice(0, 3).map(tt => tt.assignee));
                        }
                        return false;
                      }

                      // Parse leave period
                      const leaveStart = new Date(leave.startDate);
                      const leaveEnd = new Date(leave.endDate);
                      
                      // Validate leave dates
                      if (isNaN(leaveStart.getTime()) || isNaN(leaveEnd.getTime())) {
                        console.warn('[LeaveData] Invalid leave dates:', leave);
                        return false;
                      }

                      // Use due_date if available (when task needs to be done), otherwise created_date
                      const taskDueStr = t.due_date || t.created_date;
                      if (!taskDueStr) return false; // No date info for this task
                      
                      const taskDueDate = new Date(taskDueStr);
                      if (isNaN(taskDueDate.getTime())) return false; // Invalid date
                      
                      // A task is affected if:
                      // 1. It's due during or after the leave starts
                      // 2. AND the task due date is within 14 days after leave (reasonable work window)
                      const daysSinceLeavStart = (taskDueDate.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24);
                      const daysBeforeLeavStart = (leaveStart.getTime() - taskDueDate.getTime()) / (1000 * 60 * 60 * 24);
                      
                      // Task is affected if:
                      // - Due within 3 days before leave starts (might be ongoing)
                      // - OR due on/after leave starts (definitely affected)
                      return daysBeforeLeavStart <= 3 && daysSinceLeavStart <= 14;
                    });

                    const durationDays = Math.ceil(
                      (new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (86400000)
                    ) + 1;
                    const durationHours = durationDays * 8;

                    const initials = leave.name
                      .split(' ')
                      .map(word => word[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    const getStatusDot = () => {
                      if (leave.status === 'Approved') return 'bg-emerald-400';
                      if (leave.status === 'Rejected') return 'bg-rose-400';
                      return 'bg-amber-400';
                    };

                    return (
                      <div key={leave.id} className="p-6 hover:bg-white/60 transition-all duration-300">
                        <div className="flex items-center justify-between gap-6">
                          
                          {/* Employee Info */}
                          <div className="flex items-center gap-4 w-64">
                            <Avatar className="w-10 h-10 border border-white/20 shadow-sm">
                              <AvatarFallback className="bg-[#F4F4F5] text-[#121212] text-sm font-light">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm text-[#121212] font-light mb-0.5">
                                {leave.name}
                              </div>
                              <div className="text-xs text-[#737373] font-light">
                                {leave.reason}
                              </div>
                            </div>
                          </div>

                          {/* Leave Details Grid */}
                          <div className="flex-1 grid grid-cols-3 gap-4">
                            {/* Date Range */}
                            <div>
                              <div className="text-xs text-[#A3A3A3] font-light mb-1">Date Range</div>
                              <div className="text-sm text-[#262626] font-light">
                                {leave.startDate} - {leave.endDate}
                              </div>
                            </div>
                            
                            {/* Duration */}
                            <div>
                              <div className="text-xs text-[#A3A3A3] font-light mb-1">Duration</div>
                              <div className="text-sm text-[#262626] font-light">
                                {durationHours} hours
                              </div>
                            </div>
                            
                            {/* Status Badge */}
                            <div>
                              <div className="text-xs text-[#A3A3A3] font-light mb-1">Status</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${getStatusDot()}`} />
                                <span className="text-sm text-[#262626] font-light capitalize">
                                  {leave.status}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center gap-3 w-48 justify-end">
                            {leave.status === 'Pending' ? (
                              <>
                                <Button 
                                  size="sm" 
                                  className="bg-[#121212] hover:bg-[#262626] h-9 px-4 rounded-xl font-light text-white shadow-sm transition-all duration-300"
                                  onClick={() => {
                                    setSelectedLeave(leave);
                                    setAffectedTasksForShift(affectedTasks);
                                    setApproveDialogOpen(true);
                                  }}
                                >
                                  Approve
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-9 px-4 border-white/20 text-[#737373] hover:text-[#262626] hover:bg-white/50 rounded-xl font-light transition-all duration-300"
                                  onClick={() => handleRejectLeave(leave)}
                                >
                                  Deny
                                </Button>
                              </>
                            ) : (
                              <div className="h-9 flex items-center px-4">
                                <span className="text-xs text-[#A3A3A3] font-light italic">
                                  No actions available
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TEAM CALENDAR - MANAGER VIEW ONLY */}
        {activePersona === 'manager' && (
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-light text-[#262626]">Team Calendar</h2>
              <div className="flex items-center gap-2 bg-white/50 p-1 rounded-full border border-white/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 rounded-full p-0 hover:bg-white/50 hover:shadow-sm" 
                  onClick={handlePrevOverview}
                >
                  <ChevronLeft className="w-4 h-4 text-[#737373]" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-3 text-xs font-light text-[#737373] hover:bg-white/50 hover:shadow-sm rounded-full" 
                  onClick={handleResetOverview}
                >
                  {overviewStartDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 rounded-full p-0 hover:bg-white/50 hover:shadow-sm" 
                  onClick={handleNextOverview}
                >
                  <ChevronRight className="w-4 h-4 text-[#737373]" />
                </Button>
              </div>
            </div>
            
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-3">
              
              {/* Day Headers */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                <div 
                  key={idx} 
                  className="text-center text-xs font-light text-[#737373] uppercase tracking-wider py-3"
                >
                  {day}
                </div>
              ))}
              
              {/* Calendar Days */}
              {(() => {
                const calendarDays = [];
                const year = overviewStartDate.getFullYear();
                const month = overviewStartDate.getMonth();
                
                // Get first day of month and number of days
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0
                
                // Add empty cells for days before month starts
                for (let i = 0; i < adjustedFirstDay; i++) {
                  calendarDays.push(null);
                }
                
                // Add all days of the month
                for (let day = 1; day <= daysInMonth; day++) {
                  calendarDays.push(new Date(year, month, day));
                }
                
                return calendarDays.map((dateObj, idx) => {
                  if (!dateObj) {
                    return <div key={`empty-${idx}`} className="min-h-[100px] p-3 rounded-xl border border-transparent hover:border-white/20 hover:bg-white/20"></div>;
                  }
                  
                  const dateStr = dateObj.toISOString().split('T')[0];
                  const dayLeaves = leaves.filter(l => {
                    if (l.status !== 'Approved') return false;
                    const s = new Date(l.startDate);
                    s.setHours(0, 0, 0, 0);
                    const e = new Date(l.endDate);
                    e.setHours(23, 59, 59, 999);
                    const d = new Date(dateStr);
                    d.setHours(0, 0, 0, 0);
                    return d >= s && d <= e;
                  });
                  
                  return (
                    <div 
                      key={dateStr}
                      className={`min-h-[100px] p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                        dayLeaves.length > 0 
                          ? 'border-white/20 bg-white/40 hover:bg-white/60' 
                          : 'border-transparent hover:border-white/20 hover:bg-white/20'
                      }`}
                      onClick={() => {
                        if (dayLeaves.length > 0) {
                          setSelectedEvent({ 
                            date: dateStr, 
                            name: dayLeaves[0].name, 
                            type: 'pto',
                            reason: dayLeaves[0].reason 
                          });
                        }
                      }}
                    >
                      {/* Day Number */}
                      <div className="text-sm text-[#262626] font-light mb-2">
                        {dateObj.getDate()}
                      </div>
                      
                      {/* Events in Day */}
                      <div className="space-y-1">
                        {dayLeaves.map((leave, idx) => (
                          <div 
                            key={leave.id}
                            className="text-xs p-1.5 rounded-lg font-light bg-gray-200 text-gray-700 truncate hover:text-clip"
                            title={leave.name}
                            style={{
                              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)'
                            }}
                          >
                            {leave.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

      {/* EMPLOYEE VIEW */}
      {activePersona === 'employee' && (
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-light text-[#262626] mb-6">Apply for Leave</h2>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-700 font-light">
              ✓ Workspace Active | Tasks Found: {tasks.length}
            </div>
            {tasks.length > 0 ? (
              <EmployeeLeavePortal
                tasks={tasks}
                employees={employees}
                currentUserEmail={currentUser}
                onLeaveRequest={(data) => handleApplyLeave({ ...data, name: data.employeeName })}
                existingLeaves={leaves}
              />
            ) : (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-8 text-center text-amber-900 font-light italic">
                No task data synced from Jira yet.
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      <LeaveApplicationDialog 
        open={applyOpen} 
        onOpenChange={setApplyOpen} 
        currentUser={currentUser} 
        onSubmit={handleApplyLeave} 
      />

      {/* Approve Dialog */}
      {approveDialogOpen && selectedLeave && (() => {
        // Calculate dynamic data with proper date validation
        const calculateDurationDays = () => {
          try {
            // Ensure dates are in YYYY-MM-DD format
            const startDateStr = typeof selectedLeave.startDate === 'string' ? selectedLeave.startDate.split('T')[0] : '';
            const endDateStr = typeof selectedLeave.endDate === 'string' ? selectedLeave.endDate.split('T')[0] : '';
            
            if (!startDateStr || !endDateStr) {
              console.warn('[LeaveApproval] Invalid date format:', { startDate: selectedLeave.startDate, endDate: selectedLeave.endDate });
              return 0;
            }

            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            
            // Validate parsed dates
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              console.warn('[LeaveApproval] Invalid date parsing:', { startDateStr, endDateStr });
              return 0;
            }
            
            // Calculate days (inclusive of both start and end date)
            const diffMs = endDate.getTime() - startDate.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
            
            // Safety check: cap at 365 days
            if (diffDays > 365) {
              console.warn('[LeaveApproval] Duration exceeds 1 year:', diffDays);
              return 365;
            }
            
            return Math.max(1, diffDays); // At least 1 day
          } catch (error) {
            console.error('[LeaveApproval] Error calculating duration:', error);
            return 1;
          }
        };
        
        const durationDays = calculateDurationDays();
        const totalHoursLost = durationDays * 8;
        const uniqueProjects = [...new Set(affectedTasksForShift.map(t => t.projectName || 'Unknown'))];
        
        return (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" />
          <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
            <DialogContent 
              aria-describedby={undefined} 
              className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl max-w-lg font-light"
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-light text-[#262626]">
                  Leave Impact Analysis
                </DialogTitle>
              </DialogHeader>
              
              <div className="py-6 space-y-6">
                
                {/* Capacity Alert - Only Show if there are Affected Tasks */}
                {affectedTasksForShift.length > 0 ? (
                  <div className="p-5 bg-amber-50/50 rounded-2xl border-l-2 border-l-amber-300">
                    <div className="flex items-start gap-3">
                      <div className="text-amber-500 mt-0.5">⚠️</div>
                      <div>
                        <div className="text-sm text-amber-900 mb-1 font-medium">
                          Capacity Alert
                        </div>
                        <div className="text-sm text-amber-800 font-light leading-relaxed">
                          Approving this leave ({durationDays} {durationDays === 1 ? 'day' : 'days'}) will create a{' '}
                          <span className="font-medium">{totalHoursLost}h capacity gap</span> in {' '}
                          <span className="font-medium">{uniqueProjects.length} {uniqueProjects.length === 1 ? 'project' : 'projects'}</span>.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-emerald-50/50 rounded-2xl border-l-2 border-l-emerald-300">
                    <div className="flex items-start gap-3">
                      <div className="text-emerald-500 mt-0.5">✓</div>
                      <div>
                        <div className="text-sm text-emerald-900 mb-1 font-medium">
                          No Impact on Assignments
                        </div>
                        <div className="text-sm text-emerald-800 font-light leading-relaxed">
                          This employee has no active tasks during the requested leave period. Safe to approve without capacity concerns.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Recommendations */}
                <div>
                  <h3 className="text-sm font-medium text-[#121212] mb-3">
                    Affected Tasks ({affectedTasksForShift.length})
                  </h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {affectedTasksForShift.length === 0 ? (
                      <div className="p-4 bg-white/60 border border-white/20 rounded-xl text-center text-[#737373] font-light">
                        No tasks affected by this leave.
                      </div>
                    ) : (
                      affectedTasksForShift.map((task, idx) => (
                        <div key={task.id} className="p-4 bg-white/60 border border-white/20 rounded-xl">
                          <div className="text-sm text-[#262626] font-light mb-2">
                            {task.taskName}
                          </div>
                          <div className="text-xs text-[#737373] font-light">
                            Due: {task.due_date} • {task.hours}h
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              
              {/* Modal Actions */}
              <div className="flex gap-3 w-full pt-4 border-t border-white/20">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    handleRejectLeave(selectedLeave);
                    setApproveDialogOpen(false);
                    setSelectedLeave(null);
                  }} 
                  className="flex-1 h-10 border-white/20 text-[#737373] hover:text-[#262626] hover:bg-white/50 rounded-xl font-light transition-all duration-300"
                >
                  Deny
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    handleApproveLeave(selectedLeave);
                    setApproveDialogOpen(false);
                    setSelectedLeave(null);
                  }}
                  className="flex-1 h-10 border-white/20 text-[#737373] hover:text-[#262626] hover:bg-white/50 rounded-xl font-light transition-all duration-300"
                >
                  Approve Only
                </Button>
                <Button 
                  onClick={() => {
                    handleShiftTasks(selectedLeave);
                    setApproveDialogOpen(false);
                  }}
                  className="flex-1 bg-[#121212] hover:bg-[#262626] h-10 rounded-xl font-light transition-all duration-300 text-white shadow-md"
                >
                  Approve & Shift
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
        );
      })()}

      {/* Redeploy Modal */}
      {redeployOpen && selectedLeave && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setRedeployOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-[#121212]">Redeploy Tasks</h2>
                      <p className="text-sm text-gray-600 mt-1">Select an employee to redeploy tasks to.</p>
                    </div>
                  </div>
                  <button onClick={() => setRedeployOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                </div>
                
                <div className="mb-6 space-y-2 max-h-[50vh] overflow-y-auto">
                  {getAvailableEmployeesOnDate(selectedLeave.startDate).map(emp => (
                    <button
                      key={emp.name}
                      onClick={() => handleRedeploy(emp.name)}
                      className="w-full p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-between transition-all duration-200 cursor-pointer group"
                    >
                      <div className="text-left">
                        <div className="font-semibold text-[#121212]">{emp.name}</div>
                        <div className="text-xs text-gray-600 mt-0.5">Available capacity</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold px-3 py-1 rounded-full ${emp.load < 50 ? 'bg-green-100 text-green-700' : emp.load < 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {Math.round(emp.load)}% load
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="border-t border-gray-200 pt-6 flex gap-3 justify-end">
                  <button onClick={() => setRedeployOpen(false)} className="px-8 h-10 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 rounded-full font-medium transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Shift Tasks Modal */}
      {shiftOpen && selectedLeave && (
        <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-500" />
                Approve Leave & Shift Tasks
              </DialogTitle>
              <DialogDescription>
                This will approve {selectedLeave.name}'s leave and push back the deadlines of all overlapping tasks.
              </DialogDescription>
            </DialogHeader>
            
            <div className="my-4 max-h-[40vh] overflow-y-auto pr-2 space-y-3">
              {affectedTasksForShift.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No tasks need shifting.</p>
              ) : (
                affectedTasksForShift.map(task => {
                  const durationDays = Math.ceil((new Date(selectedLeave.endDate).getTime() - new Date(selectedLeave.startDate).getTime()) / (86400000)) + 1;
                  const newDueDate = new Date(new Date(task.due_date).getTime() + durationDays * 86400000).toISOString().split('T')[0];
                  
                  return (
                    <div key={task.id} className="p-3 bg-slate-50 border rounded-lg flex justify-between items-center">
                      <div className="max-w-[60%]">
                        <p className="font-medium text-sm truncate">{task.taskName}</p>
                      </div>
                      <div className="text-xs flex items-center gap-2">
                        <span className="text-slate-500 line-through">{task.due_date}</span>
                        <span className="text-blue-500 font-bold">→ {newDueDate}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShiftOpen(false)} className="px-6 rounded-full">Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 px-6 rounded-full" onClick={() => performShiftTasks(selectedLeave)}>Confirm & Shift</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* EVENT DETAIL DRAWER */}
      {selectedEvent && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300"
            onClick={() => setSelectedEvent(null)}
          />
          
          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-[420px] bg-white/80 backdrop-blur-2xl shadow-2xl z-50 overflow-y-auto border-l border-white/20">
            <div className="p-8">
              
              {/* Header */}
              <div className="flex items-start justify-between mb-8">
                <div>
                  <div className="text-xl font-light text-[#262626] mb-2">
                    {selectedEvent.name}
                  </div>
                  <div className="text-sm text-[#737373] font-light">
                    {selectedEvent.date}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-[#A3A3A3] hover:text-[#737373] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Details */}
              <div className="space-y-6">
                
                {/* Event Type */}
                <div>
                  <div className="text-xs text-[#737373] font-light mb-2">Type</div>
                  <div className="text-sm text-[#262626] font-light">
                    {selectedEvent.type === 'pto' ? 'Paid Time Off' : 'Project Work'}
                  </div>
                </div>
                
                {/* Reason */}
                {selectedEvent.reason && (
                  <div>
                    <div className="text-xs text-[#737373] font-light mb-2">Reason</div>
                    <div className="text-sm text-[#262626] font-light">
                      {selectedEvent.reason}
                    </div>
                  </div>
                )}
                
                {/* View Details Button */}
                <div className="pt-6 border-t border-gray-100">
                  <Button 
                    variant="outline" 
                    className="w-full h-11 rounded-xl font-light border-white/20 text-[#262626] transition-all duration-300 hover:bg-white/50"
                  >
                    View Full Details
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}