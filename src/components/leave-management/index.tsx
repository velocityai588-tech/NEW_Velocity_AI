import React, { useState, useEffect } from 'react';
import { Users, Upload, Zap, AlertCircle, RefreshCw } from 'lucide-react'; 
import { Button } from '../ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../ui/select';

// Imports from your existing structure
import { Task, LeaveRequest, TimeLog, EmployeeProfile } from './types';
import { ImpactAnalysisDialog } from './ImpactAnalysisDialog';
import { TimeLoggingDialog } from './TimeLoggingDialog';
import { TimesheetUploadDialog } from './TimeSheetUploadDialog';
import { LeaveApplicationDialog } from './LeaveApplicationDialog';
import { EmployeeLeavePortal } from './EmployeeLeavePortal';
import { LeaveNotificationPanel } from './LeaveNotificationPanel';
import { TeamCapacityPanel } from './TeamCapacityPanel';
import LeaveApprovalAgent from '../leave-approval/LeaveApprovalAgent';

// FIX: Import 'fetchRawCSV' to get the actual Task data, not the ML Summary
import { fetchRawCSV } from '../ml-model/RecommendationEngine';
import { fetchProjectsHybrid, fetchIssuesHybrid } from '@/lib/jiraDbClient';

// --- JIRA INTEGRATION HELPERS ---
interface JiraProjectData {
  tasks: Task[];
  employees: EmployeeProfile[];
  leaves: LeaveRequest[];
}

const checkJiraConnectionForLeaves = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/jira/auth/status', { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      return data.connected === true;
    }
    return false;
  } catch (error) {
    console.error('[Jira Leave] Connection check failed:', error);
    return false;
  }
};

const fetchJiraProjectsForLeaves = async (): Promise<any[]> => {
  try {
    const { projects } = await fetchProjectsHybrid();
    return projects;
  } catch (error) {
    console.error('[Jira Leave] Error fetching projects:', error);
    return [];
  }
};

const fetchJiraLeaveAndTaskData = async (): Promise<JiraProjectData> => {
  const result: JiraProjectData = {
    tasks: [],
    employees: new Map() as any,
    leaves: [],
  };

  try {
    // Check Jira connection
    const isConnected = await checkJiraConnectionForLeaves();
    if (!isConnected) {
      console.log('[Jira Leave] Not connected to Jira');
      return result;
    }

    console.log('[Jira Leave] Connected to Jira! Fetching data...');

    // Fetch all Jira projects
    const jiraProjects = await fetchJiraProjectsForLeaves();
    if (jiraProjects.length === 0) {
      console.log('[Jira Leave] No Jira projects found');
      return result;
    }

    console.log(`[Jira Leave] Found ${jiraProjects.length} Jira projects`);

    // Collect tasks and employees from all projects
    const uniqueEmployees = new Map<string, EmployeeProfile>();
    const allTasks: Task[] = [];
    const getsStableDay = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
      return Math.abs(hash) % 5;
    };

    for (const project of jiraProjects) {
      try {
        const { issues } = await fetchIssuesHybrid(project.key);

        issues.forEach((issue: any, idx: number) => {
          // Create task from issue - extract Jira dates
          const assignee = issue.assignee || 'Unassigned';
          const createdDate = issue.start || issue.created || new Date().toISOString();
          const dueDate = issue.due || createdDate;
          
          const task: Task = {
            id: allTasks.length + idx,
            projectName: project.key || project.title,
            taskName: `${issue.key}: ${issue.summary}`,
            assignee,
            hours: issue.priority?.toLowerCase().includes('high') ? 16 : 8,
            day: getsStableDay(issue.key),
            requiredSkills: [issue.issueType || 'Development'],
            isReallocated: false,
            isCancelled: issue.status?.toLowerCase().includes('closed'),
            totalLogged: 0,
            logs: [],
            created_date: typeof createdDate === 'string' ? createdDate.split('T')[0] : createdDate,
            due_date: typeof dueDate === 'string' ? dueDate.split('T')[0] : dueDate,
          };

          allTasks.push(task);

          // Add employee if not exists
          if (assignee && assignee !== 'Unassigned' && !uniqueEmployees.has(assignee)) {
            uniqueEmployees.set(assignee, {
              name: assignee,
              role: issue.issueType || 'Developer',
              skills: [issue.issueType || 'Development'],
            });
          }
        });
      } catch (error) {
        console.error(`[Jira Leave] Error processing project ${project.key}:`, error);
        continue;
      }
    }

    result.tasks = allTasks;
    result.employees = Array.from(uniqueEmployees.values());

    // Try to fetch leave-related data (look for issues with "Leave" label)
    // Note: This requires a Leave issue type or custom label in Jira
    try {
      const { issues: leaveIssues } = await fetchIssuesHybrid('LEAVE');
      if (leaveIssues.length > 0) {
        
        result.leaves = leaveIssues.map((issue: any, idx: number) => ({
          id: idx,
          name: issue.assignee || 'Unassigned',
          startDate: issue.created?.split('T')[0] || new Date().toISOString().split('T')[0],
          endDate: issue.due || new Date().toISOString().split('T')[0],
          reason: issue.description || issue.summary,
          status: issue.status?.toLowerCase().includes('approved') ? 'Approved' : 'Pending' as const,
        }));


      }
    } catch (error) {
      console.warn('[Jira Leave] Could not fetch leave issues:', error);
      result.leaves = [];
    }



    return result;
  } catch (error) {
    console.error('[Jira Leave] Error fetching Jira data:', error);
    return result;
  }
};

export default function LeaveManagementTab() {
  const [activePersona, setActivePersona] = useState<'manager' | 'employee'>('manager');
  
  // State for Real Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<string>("Aarav Sharma"); 
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataSource, setDataSource] = useState<'JIRA' | 'CSV'>('CSV'); // Track data source

  // Leave State
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  // Dialog States
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [redeployOpen, setRedeployOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [predictions, setPredictions] = useState<any[]>([]);

  // --- 1. LOAD DATA FROM JIRA OR CSV ---
  useEffect(() => {
    const fetchData = async () => {
      let loadedTasks: Task[] = [];
      let loadedEmployees: EmployeeProfile[] = [];
      let loadedLeaves: LeaveRequest[] = [];
      let source: 'JIRA' | 'CSV' = 'CSV';

      const getStableDay = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash) % 5;
      };

      try {
        // Try to fetch from Jira first
        const jiraData = await fetchJiraLeaveAndTaskData();
        
        if (jiraData.tasks.length > 0 && jiraData.employees.length > 0) {
          loadedTasks = jiraData.tasks;
          loadedEmployees = jiraData.employees;
          loadedLeaves = jiraData.leaves;
          source = 'JIRA';
        } else {
          // Fall back to CSV if no Jira data
          const csvUrl = new URL('../ml-model/datasets/master_employee_task_report.csv', import.meta.url).href;
          const rawData: any[] = await fetchRawCSV(csvUrl);
          
          // Transform CSV Data -> System Task Model
          const today = new Date();
          const tasks: Task[] = rawData
            .filter(row => row.Assignee && row["Task Name"]) // Ensure row has data
            .map((row, index) => {
              // Generate stable dates for calendar mapping
              const taskHash = getStableDay(row["Task Name"] || index.toString());
              const createdDate = new Date(today);
              createdDate.setDate(createdDate.getDate() - (5 - taskHash)); // Stagger tasks across 5 days
              
              const durationDays = Math.max(1, Math.ceil((parseFloat(row["Planned Hours"]) || 1) / 8));
              const dueDate = new Date(createdDate);
              dueDate.setDate(dueDate.getDate() + durationDays);
              
              return {
                id: index,
                projectName: row.Project || "Unassigned",
                taskName: row["Task Name"] || "Untitled Task",
                assignee: row.Assignee || "Unassigned",
                hours: parseFloat(row["Planned Hours"]) || 1,
                day: taskHash, 
                requiredSkills: row["Skill Used"] ? [row["Skill Used"]] : [],
                isReallocated: false,
                isCancelled: false,
                totalLogged: parseFloat(row["Actual Hours"]) || 0,
                logs: [],
                created_date: createdDate.toISOString().split('T')[0],
                due_date: dueDate.toISOString().split('T')[0]
              };
            });

          loadedTasks = tasks;

          // Extract Employees from the loaded tasks
          const uniqueNames = Array.from(new Set(tasks.map(t => t.assignee)));
          const employees: EmployeeProfile[] = uniqueNames.map(name => {
            const userTasks = tasks.filter(t => t.assignee === name);
            const skills = Array.from(new Set(userTasks.flatMap(t => t.requiredSkills)));
            return {
              name,
              role: skills[0] || "Developer",
              skills: skills.slice(0, 4)
            };
          });

          loadedEmployees = employees;
          source = 'CSV';
        }
        
      } catch (error) {
        console.error("[LeaveManagement] Load Failed (CSV fallback):", error);
        source = 'CSV';
      } finally {
        setTasks(loadedTasks);
        setEmployees(loadedEmployees);
        setDataSource(source);

        if (loadedLeaves.length > 0) {
          setLeaves(loadedLeaves);
        }

        const uniqueNames = loadedTasks.map(t => t.assignee);
        if (uniqueNames.length > 0 && !uniqueNames.includes(currentUser)) {
          setCurrentUser(uniqueNames[0]);
        }
        
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, []);

  // --- Logic Helpers ---
  const handleImportTasks = (newTasks: Task[]) => {
    setTasks(prev => [...prev, ...newTasks]);
  };

  // Calculate available employees on a specific date
  const getAvailableEmployeesOnDate = (date: string): { name: string; load: number }[] => {
    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    return employees
      .map(emp => {
        // Get tasks for this employee on this date
        const empTasks = tasks.filter(t => {
          if (t.assignee !== emp.name || t.isCancelled) return false;

          const startDate = new Date(t.created_date || t.day ? new Date() : new Date());
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(t.due_date || t.day ? new Date() : new Date());
          endDate.setHours(23, 59, 59, 999);

          return dateObj >= startDate && dateObj <= endDate;
        });

        const currentLoad = empTasks.reduce((sum, t) => sum + (t.hours / 8), 0) * 20; // Convert to percentage
        return { name: emp.name, load: Math.min(100, currentLoad) };
      })
      .filter(emp => emp.load < 80) // Only show employees with < 80% load
      .sort((a, b) => a.load - b.load); // Sort by availability
  };

  const handleReviewLeave = (leave: LeaveRequest) => {
    const absenteeTasks = tasks.filter(t => t.assignee === leave.name && !t.isReallocated && !t.isCancelled);
    const newPredictions = absenteeTasks.map(task => ({
      task,
      newAssignee: "AI Recommendation", 
      reason: "Capacity Available",
      score: 85
    }));
    setPredictions(newPredictions);
    setSelectedLeave(leave);
    setScenarioOpen(true);
  };

  const confirmReallocation = () => {
    if (!selectedLeave) return;
    setTasks(prev => {
      const newTasks = [...prev];
      newTasks.filter(t => t.assignee === selectedLeave.name && !t.isReallocated).forEach(t => t.isCancelled = true);
      return newTasks;
    });
    setLeaves(prev => prev.map(l => l.id === selectedLeave.id ? { ...l, status: 'Approved' } : l));
    setScenarioOpen(false);
  };

  // --- Agent Handler ---
  const handleApprovalsComplete = (results: any[], summary: any) => {
    // Update leave statuses based on approval results
    const updatedLeaves = leaves.map(leave => {
      const result = results.find(r => r.leaveId === leave.id);
      if (result && result.approved) {
        return { ...leave, status: 'Approved' as const };
      }
      return leave;
    });

    setLeaves(updatedLeaves);
  };

  const handleTaskClick = (task: Task) => {
    if (activePersona === 'employee' && !task.isCancelled) {
      setSelectedTask(task);
      setLogOpen(true);
    }
  };

  const handleRefreshJiraData = async () => {
    if (dataSource !== 'JIRA') {
      alert('Currently using CSV data. Connect to Jira to enable refresh.');
      return;
    }
    
    setIsLoadingData(true);
    try {
      const jiraData = await fetchJiraLeaveAndTaskData();
      if (jiraData.tasks.length > 0 && jiraData.employees.length > 0) {
        setTasks(jiraData.tasks);
        setEmployees(jiraData.employees);
        if (jiraData.leaves.length > 0) {
          setLeaves(jiraData.leaves);
        }
        alert('Jira data refreshed successfully!');
      } else {
        alert('Failed to refresh Jira data.');
      }
    } catch (error) {
      console.error('[LeaveManagement] Error refreshing Jira data:', error);
      alert('Error refreshing Jira data.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const saveLogs = (taskId: number, newLogs: TimeLog[]) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { 
      ...t, 
      logs: newLogs, 
      totalLogged: (t.totalLogged || 0) + newLogs.reduce((a, b) => a + b.hours, 0) 
    } : t));
    setLogOpen(false);
  };

  const handleApplyLeave = (request: Omit<LeaveRequest, 'id' | 'status'>) => {
    const newLeave: LeaveRequest = {
      id: Date.now(),
      ...request,
      status: 'Pending'
    };
    setLeaves(prev => [newLeave, ...prev]);
  };

  // Handle leave request from Employee Portal
  const handleEmployeeLeaveRequest = (leaveData: { 
    employeeName: string;
    startDate: string; 
    endDate: string; 
    reason: string; 
    affectedTasks: any[];
    project: string;
  }) => {
    const newLeave: LeaveRequest = {
      id: Date.now(),
      name: leaveData.employeeName,
      startDate: leaveData.startDate,
      endDate: leaveData.endDate,
      reason: leaveData.reason,
      status: 'Pending'
    };

    // Add leave request
    setLeaves(prev => [newLeave, ...prev]);

    // Log affected tasks for manager notification

  };

  // Handle leave approval from notification panel
  const handleApproveLeave = (leave: LeaveRequest) => {
    setLeaves(prev => 
      prev.map(l => l.id === leave.id ? { ...l, status: 'Approved' } : l)
    );

  };

  // Handle leave rejection from notification panel
  const handleRejectLeave = (leave: LeaveRequest) => {
    setLeaves(prev => 
      prev.map(l => l.id === leave.id ? { ...l, status: 'Rejected' } : l)
    );
  };

  // Handle redeploy - reassign tasks from one employee to another
  const handleRedeploy = (selectedEmployee: string) => {
    if (!selectedLeave) return;

    // Get all tasks for the on-leave employee
    const tasksToRedeploy = tasks.filter(t => 
      t.assignee === selectedLeave.name && 
      !t.isCancelled && 
      !t.isReallocated
    );

    // Reassign all tasks to the selected employee
    setTasks(prev => prev.map(t => 
      tasksToRedeploy.some(tr => tr.id === t.id)
        ? { ...t, assignee: selectedEmployee, isReallocated: true }
        : t
    ));

    setRedeployOpen(false);
    setSelectedLeave(null);
  };

  if (isLoadingData) {
    return <div className="p-10 text-center text-gray-500 animate-pulse">Loading Workforce Data...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg gap-4">
        
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500 p-2 rounded-lg text-white"><Users className="w-5 h-5" /></div>
          <div>
            <h3 className="font-light text-white text-sm">Leave Management System</h3>
            <p className="text-xs text-slate-400">
              {activePersona === 'manager' ? '👨‍💼 Manager Dashboard' : `👤 Employee: ${currentUser}`}
            </p>
          </div>
          
          {/* DATA SOURCE INDICATOR */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-4 border ${
            dataSource === 'JIRA' 
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' 
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}>
            {dataSource === 'JIRA' ? (
              <>
                <Zap className="w-3 h-3" />
                Live Jira
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3" />
                CSV Data
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">

           <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
             <button onClick={() => setActivePersona('manager')} className={`px-3 py-1 rounded-md text-xs font-light transition-all ${activePersona === 'manager' ? 'bg-primary text-white shadow' : 'text-slate-400'}`}>Manager</button>
             <button onClick={() => setActivePersona('employee')} className={`px-3 py-1 rounded-md text-xs font-light transition-all ${activePersona === 'employee' ? 'bg-primary text-white shadow' : 'text-slate-400'}`}>Employee</button>
           </div>
        </div>
      </div>

      {/* Agent Component - Only show to managers with pending leaves */}
      {activePersona === 'manager' && (
        <div className="w-full mb-4 mt-4 space-y-6">
          {/* ACTIVE LEAVES DASHBOARD */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-300 rounded-2xl p-6 shadow-lg">
            <h3 className="text-xl font-light text-primary mb-6 flex items-center gap-2">
              📋 Active Leave Requests
            </h3>
            
            {leaves.filter(l => l.status !== 'Rejected').length === 0 ? (
              <div className="text-center p-8 text-slate-500">
                <AlertCircle className="w-12 h-12 mx-auto opacity-30 mb-2" />
                <p>No active leave requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {leaves.filter(l => l.status !== 'Rejected').map(leave => {
                  const employeeTasks = tasks.filter(t => t.assignee === leave.name && !t.isCancelled);
                  const affectedTasks = employeeTasks.filter(t => {
                    const startDate = new Date(t.created_date || new Date());
                    const endDate = new Date(t.due_date || new Date());
                    const leaveDate = new Date(leave.startDate);
                    return leaveDate >= startDate && leaveDate <= endDate;
                  });

                  return (
                    <div key={leave.id} className={`p-5 rounded-xl border-2 ${leave.status === 'Approved' ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-light text-lg text-slate-900">{leave.name}</h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${leave.status === 'Approved' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                              {leave.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                            <div>
                              <p className="text-slate-600"><strong>Leave Date:</strong> {new Date(leave.startDate).toLocaleDateString()}</p>
                              {leave.endDate && <p className="text-slate-600"><strong>End Date:</strong> {new Date(leave.endDate).toLocaleDateString()}</p>}
                            </div>
                            <div>
                              <p className="text-slate-600"><strong>Reason:</strong> {leave.reason}</p>
                              <p className="text-slate-600"><strong>Affected Tasks:</strong> {affectedTasks.length}</p>
                            </div>
                          </div>
                          
                          {affectedTasks.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-bold text-slate-700 mb-2">Tasks that will be affected:</p>
                              <div className="flex flex-wrap gap-2">
                                {affectedTasks.slice(0, 3).map(task => (
                                  <span key={task.id} className="px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded">
                                    {task.taskName.substring(0, 30)}...
                                  </span>
                                ))}
                                {affectedTasks.length > 3 && <span className="px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded">+{affectedTasks.length - 3} more</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {leave.status !== 'Rejected' && (
                          <div className="flex gap-2 flex-wrap justify-end min-w-[250px]">
                            {leave.status === 'Pending' && (
                              <>
                                <Button 
                                  size="sm" 
                                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                                  onClick={() => handleApproveLeave(leave)}
                                >
                                  ✓ Approve
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="border-red-600 text-red-600 hover:bg-red-50"
                                  onClick={() => handleRejectLeave(leave)}
                                >
                                  ✕ Reject
                                </Button>
                              </>
                            )}
                            
                            {affectedTasks.length > 0 && (
                              <Button 
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setRedeployOpen(true);
                                }}
                              >
                                🔄 Redeploy
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Views */}
      {activePersona === 'employee' && (
        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
          {tasks.length > 0 ? (
            <EmployeeLeavePortal
              tasks={tasks}
              employees={employees}
              currentUserEmail={currentUser}
              onLeaveRequest={handleEmployeeLeaveRequest}
            />
          ) : (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-amber-600 mb-3 opacity-50" />
              <h3 className="text-lg font-bold text-amber-900 mb-2">No Tasks Available</h3>
              <p className="text-sm text-amber-700">
                {dataSource === 'JIRA' 
                  ? 'No tasks found in your connected Jira projects. Check your Jira connection or refresh the data.'
                  : 'No tasks found in the CSV data. Upload a timesheet to get started.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Manager View - Team Capacity Analysis */}
      {activePersona === 'manager' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-lg">
            <h3 className="text-xl font-light text-slate-900 mb-4 flex items-center gap-2">
              📊 Team Capacity Overview
            </h3>
            
            {employees && employees.length > 0 ? (
              <TeamCapacityPanel 
                candidates={employees.map(emp => ({
                  id: emp.name,
                  name: emp.name,
                  current_load: emp.currentLoaded || 0,
                  skills: emp.skills || [],
                  role_level: emp.role || 'employee',
                  avg_completion_time: 8,
                  efficiency_score: emp.completionRate || 0.8,
                  base_productive_hours: 40,
                  pto_hours_this_week: leaves.filter(l => 
                    l.name === emp.name && 
                    l.status === 'Approved' &&
                    new Date(l.startDate) >= new Date() &&
                    new Date(l.startDate) <= new Date(new Date().getTime() + 7*24*60*60*1000)
                  ).reduce((sum, l) => {
                    const start = new Date(l.startDate);
                    const end = new Date(l.endDate);
                    const days = Math.ceil((end.getTime() - start.getTime()) / (1000*60*60*24));
                    return sum + (days * 8);
                  }, 0),
                  holiday_hours_this_week: 0
                }))}
                refreshTrigger={leaves.length}
              />
            ) : (
              <div className="text-center py-8 text-slate-500">
                <p>Loading team capacity data...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ImpactAnalysisDialog open={scenarioOpen} onOpenChange={setScenarioOpen} predictions={predictions} onConfirm={confirmReallocation} />
      <TimeLoggingDialog open={logOpen} onOpenChange={setLogOpen} task={selectedTask} onSave={saveLogs} />
      <TimesheetUploadDialog open={importOpen} onOpenChange={setImportOpen} onImport={handleImportTasks} />
      <LeaveApplicationDialog 
        open={applyOpen} 
        onOpenChange={setApplyOpen} 
        currentUser={currentUser} 
        onSubmit={handleApplyLeave} 
      />

      {/* REDEPLOY DIALOG */}
      {redeployOpen && selectedLeave && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full animate-in slide-in-from-bottom-4">
            <h3 className="text-xl font-light text-slate-900 mb-4">🔄 Redeploy Tasks</h3>
            <p className="text-sm text-slate-600 mb-4">
              Select an available employee to reassign {selectedLeave.name}'s tasks on {new Date(selectedLeave.startDate).toLocaleDateString()}
            </p>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto mb-6">
              {getAvailableEmployeesOnDate(selectedLeave.startDate).map(emp => (
                <button
                  key={emp.name}
                  onClick={() => {
                    handleRedeploy(emp.name);
                  }}
                  className="w-full text-left p-4 bg-slate-50 hover:bg-indigo-50 border-2 border-slate-200 hover:border-indigo-400 rounded-lg transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{emp.name}</span>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                      {Math.round(emp.load)}% loaded
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                    <div 
                      className={`h-full rounded-full ${emp.load > 60 ? 'bg-orange-500' : 'bg-green-500'}`}
                      style={{ width: `${emp.load}%` }}
                    />
                  </div>
                </button>
              ))}
              
              {getAvailableEmployeesOnDate(selectedLeave.startDate).length === 0 && (
                <div className="text-center p-6 text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">No available employees on this date</p>
                </div>
              )}
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setRedeployOpen(false);
                setSelectedLeave(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export PTOImpactPanel for use in other components
export { PTOImpactPanel } from './PTOImpactPanel';
export { usePTOImpact } from '@/hooks/usePTOImpact';
export { fetchTeamCapacity, convertJiraToCapacityCandidate } from '@/lib/capacityService';
export { TeamCapacityPanel } from './TeamCapacityPanel';