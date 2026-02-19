import React from 'react';
import { Card } from '../ui/card';
import { CheckCircle2, Briefcase, Plus, FolderGit2 } from 'lucide-react';
import { Task, EmployeeProfile } from './types';
import { DAYS } from './data';
// IMPORT THE NEW COMPONENT
import { OrganizationalWorkloadTable } from './OrganizationalWorkloadTable';

interface WorkloadTableProps {
  tasks: Task[];
  employees: EmployeeProfile[];
  persona: 'manager' | 'employee';
  onTaskClick: (task: Task) => void;
  approvedLeaves?: any[];
}

export const WorkloadTable: React.FC<WorkloadTableProps> = ({ tasks, employees, persona, onTaskClick, approvedLeaves = [] }) => {
  const isManager = persona === 'manager';

  // --- REFACTOR: Delegate to shared component for Manager View ---
  if (isManager) {
    return (
      <OrganizationalWorkloadTable 
        tasks={tasks} 
        employees={employees} 
        onTaskClick={onTaskClick}
        approvedLeaves={approvedLeaves}
      />
    );
  }

  // --- EMPLOYEE VIEW LOGIC (The Matrix View) ---
  const employeeRows = Array.from(new Set(tasks.map(t => t.projectName))).sort();

  const getCellData = (rowId: string, dayIndex: number) => {
    return tasks.filter(t => t.projectName === rowId && t.day === dayIndex && !t.isCancelled);
  };

  const getDailyHours = (rowId: string, dayIndex: number) => {
    return getCellData(rowId, dayIndex).reduce((sum, t) => sum + t.hours, 0);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Briefcase className="text-indigo-600" /> My Timesheet Matrix
      </h2>

      <Card className="rounded-xl border-none shadow-2xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                <th className="p-4 text-left text-[10px] font-black text-gray-400 uppercase w-48 border-r sticky left-0 bg-slate-50 z-10">
                  Project / Context
                </th>
                {DAYS.map(day => (
                  <th key={day} className="p-4 text-center text-[10px] font-black text-gray-400 uppercase min-w-[140px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employeeRows.map(project => (
                <tr key={project} className="border-b border-gray-50 align-top">
                   <td className="p-4 border-r bg-slate-50 sticky left-0 z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderGit2 className="w-4 h-4 text-indigo-500" />
                        <span className="font-bold text-sm text-indigo-900 leading-tight">{project}</span>
                      </div>
                   </td>
                   {/* Inline rendering of cells for Employee View */}
                   {DAYS.map((_, dayIndex) => {
                      const dayTasks = getCellData(project, dayIndex);
                      const totalHours = getDailyHours(project, dayIndex);
                      
                      return (
                        <td key={dayIndex} className="p-2 align-top h-32 hover:bg-slate-50 transition-colors">
                          {totalHours > 0 && (
                            <div className="flex justify-between items-center mb-2 px-1">
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {totalHours}h TOTAL
                              </span>
                            </div>
                          )}
                          <div className="space-y-2">
                            {dayTasks.map(t => {
                                const progressPercent = Math.min(100, ((t.totalLogged || 0) / t.hours) * 100);
                                return (
                                  <div 
                                    key={t.id} 
                                    onClick={() => onTaskClick(t)}
                                    className="p-3 rounded-lg border relative transition-all shadow-sm group overflow-hidden bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md cursor-pointer"
                                  >
                                    {!t.isCancelled && (
                                      <div 
                                        className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-500" 
                                        style={{ width: `${progressPercent}%` }}
                                      />
                                    )}
                                    <div className="flex justify-between font-black uppercase tracking-tight mb-1">
                                      <span className="truncate w-24 text-slate-700 text-[10px]">Task Item</span>
                                      <span className="text-slate-400 text-[9px]">{t.totalLogged || 0}/{t.hours}h</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-indigo-900 mb-1 leading-tight">{t.taskName}</p>
                                    
                                    <div className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 transition-opacity">
                                      <div className="bg-indigo-600 text-white p-1 rounded-md shadow-sm">
                                        <Plus className="w-3 h-3" />
                                      </div>
                                    </div>
                                  </div>
                                );
                            })}
                          </div>
                        </td>
                      );
                   })}
                </tr>
              ))}
              
              {employeeRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-sm italic">
                    No active projects assigned this week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};