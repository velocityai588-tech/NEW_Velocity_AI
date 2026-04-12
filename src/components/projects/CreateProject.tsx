import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { VelocityAISidebar } from '@/components/dashboard/VelocityAISidebar';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, ChevronDown, Check, Trash2, Loader2, FileUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getCurrentOrgId } from '@/lib/orgContext';
import { TaskUploadDialog } from '@/components/projects/TaskUploadDialog';
import { type ParsedTask } from '@/services/fileParsingService';

// Logic Hooks
import { useProjects } from '@/hooks/useProjects';
import { useLeaveManagementData } from '@/hooks/useLeaveManagementData';

// --- Visual Helpers ---
function deriveProjectKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  let key = words.length === 1 ? words[0].substring(0, 5) : words.map(w => w[0]).join('').substring(0, 5);
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidProjectKey(key: string): boolean {
  return /^[A-Z0-9]{1,5}$/.test(key);
}

export default function CreateProject() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // 1. Data & Logic Hooks (The Engine)
  const { commitProject, isLoading: isSubmitting } = useProjects();
  const { employees, isLoading: loadingMembers } = useLeaveManagementData();

  // Helper to get today's date in YYYY-MM-DD format
  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // 2. UI State (The Look)
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [projectType, setProjectType] = useState('Scrum Software Development');
  const [projectLead, setProjectLead] = useState(''); // ID of the lead
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(getTodayDateString()); // Default to today's date
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState(0);

  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [tasks, setTasks] = useState([
    { id: 1, name: 'Database Setup', assignee: 'Unassigned', hours: '4', timeline: 'Week 1', startDate: getTodayDateString(), dueDate: '' },
  ]);

  const location = useLocation();
  const incomingAction = location.state?.incomingAction;

  // Upload dialog state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // Calculate estimated hours based on days between start and due date
  const calculateEstimatedHours = (start: string, due: string) => {
    if (!start || !due) return 0;
    const startDateObj = new Date(start);
    const dueDateObj = new Date(due);
    const diffTime = Math.abs(dueDateObj.getTime() - startDateObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include the first day
    return diffDays * 8; // 8 hours per day
  };

  // Auto-set Project Lead to current user if available
  useEffect(() => {
    if (employees.length > 0 && !projectLead && user?.id) {
      // Try to find the user in the employee list to select them by default
      const me = employees.find(e => e.id === user.id);
      if (me) setProjectLead(me.id);
    }
  }, [employees, user, projectLead]);
  
  // Handle incoming action items from Gmail
  useEffect(() => {
    if (incomingAction) {
      setProjectName(incomingAction.title);
      setProjectKey(deriveProjectKey(incomingAction.title));
      setDescription(incomingAction.description);
      
      // If metadata has tasks or dates, populate them
      if (incomingAction.metadata?.dueDate) {
        setDueDate(incomingAction.metadata.dueDate);
      }
      
      toast({
        title: "Action Imported",
        description: "Drafting project from Gmail action item.",
      });
    }
  }, [incomingAction]);

  // --- Handlers ---

  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setProjectName(name);
    if (!keyManuallyEdited) {
      setProjectKey(deriveProjectKey(name));
    }
  };

  const handleProjectKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    setProjectKey(raw);
    setKeyManuallyEdited(true);
  };

  const handleAddTask = () =>
    setTasks(prev => [
      ...prev,
      { id: Date.now(), name: '', assignee: 'Unassigned', hours: '0', timeline: '', startDate: getTodayDateString(), dueDate: '' },
    ]);

  const handleDeleteTask = (id: number) => {
    if (tasks.length > 1) setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleTaskChange = (id: number, field: string, value: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id === id) {
          const updatedTask = { ...t, [field]: value };
          // Auto-calculate hours when start or due date changes
          if ((field === 'startDate' || field === 'dueDate') && updatedTask.startDate && updatedTask.dueDate) {
            const calculatedHours = calculateEstimatedHours(updatedTask.startDate, updatedTask.dueDate);
            updatedTask.hours = String(calculatedHours);
          }
          return updatedTask;
        }
        return t;
      })
    );
  };

  const handleTasksImported = (parsedTasks: ParsedTask[], projectNameFromFile?: string, projectDescFromFile?: string) => {
    // Set project name and description from file if not already set
    if (projectNameFromFile && !projectName) {
      setProjectName(projectNameFromFile);
      if (!keyManuallyEdited) {
        setProjectKey(deriveProjectKey(projectNameFromFile));
      }
    }

    if (projectDescFromFile && !description) {
      setDescription(projectDescFromFile);
    }

    // Convert parsed tasks to the task format
    const newTasks = parsedTasks.map(pt => ({
      id: Date.now() + Math.random(),
      name: pt.name,
      assignee: pt.assignee,
      hours: pt.hours,
      timeline: pt.timeline,
      startDate: pt.startDate,
      dueDate: pt.dueDate,
    }));

    // Replace existing tasks with imported ones
    setTasks(newTasks);

    toast({
      title: 'Tasks Imported',
      description: `Successfully imported ${newTasks.length} task${newTasks.length !== 1 ? 's' : ''} from file.`,
    });
  };

  const toggleMember = (id: string) =>
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );

  // --- Unified Submission ---
  const handleCreateProject = async () => {
    if (!projectName.trim() || !projectKey.trim()) return;

    const orgId = getCurrentOrgId();
    if (!orgId) {
      toast({ title: "Error", description: "Organization not found.", variant: "destructive" });
      return;
    }

    // Call the unified hook logic
    const successProjectId = await commitProject(orgId, {
      name: projectName,
      key: projectKey,
      description: description,
      selectedTeamIds: selectedMembers,
      tasks: tasks.filter(t => t.name.trim()).map(t => {
        // Find the assignee ID by matching employee name
        const assigneeEmployee = employees.find(e => e.name === t.assignee);
        return {
          id: String(t.id),
          task: t.name,
          estimatedHours: Number(t.hours) || 0,
          status: 'not_started',
          startDate: t.startDate ? new Date(t.startDate) : undefined,
          dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
          assigneeId: assigneeEmployee ? assigneeEmployee.id : undefined
        };
      })
    });

    if (successProjectId) {
      navigate('/projects');
    }
  };

  return (
    <VelocityAISidebar>
      <div className="bg-[#FAFAF9] min-h-screen p-8 md:p-12 font-['Inter',sans-serif]">
        <div className="max-w-[1400px] mx-auto">

          {/* Back navigation */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate('/projects')}
              className="p-2 hover:bg-[#E7E5E4] rounded-full transition-colors text-[#78716C]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-light text-[#1C1917] tracking-tight">Create New Project</h1>
          </div>

          <div className="bg-white rounded-[24px] border border-[#E7E5E4] p-8 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

              {/* ---- LEFT: Project details ---- */}
              <div className="lg:col-span-2 space-y-6">

                {/* Name + Key row */}
                <div className="grid grid-cols-4 gap-6">
                  <div className="col-span-3 space-y-2">
                    <label className="text-xs font-bold text-[#A8A29E] uppercase tracking-wider">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={handleProjectNameChange}
                      placeholder="e.g. Mobile App Redesign"
                      className="w-full h-11 px-4 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#1C1917] text-[#1C1917] placeholder:text-[#A8A29E] transition-all"
                    />
                  </div>
                  <div className="col-span-1 space-y-2">
                    <label className="text-xs font-bold text-[#A8A29E] uppercase tracking-wider">
                      Key *
                    </label>
                    <input
                      type="text"
                      value={projectKey}
                      onChange={handleProjectKeyChange}
                      placeholder="MOB"
                      maxLength={5}
                      className={`w-full h-11 px-4 bg-[#FAFAF9] border rounded-xl focus:outline-none focus:ring-1 focus:ring-[#1C1917] text-[#1C1917] transition-all ${projectKey && !isValidProjectKey(projectKey) ? 'border-rose-300 bg-rose-50' : 'border-[#E7E5E4]'
                        }`}
                    />
                  </div>
                </div>

                {/* Project Type */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#A8A29E] uppercase tracking-wider">Project Type</label>
                  <div className="relative">
                    <select
                      value={projectType}
                      onChange={e => setProjectType(e.target.value)}
                      className="w-full h-11 px-4 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl appearance-none focus:outline-none focus:ring-1 focus:ring-[#1C1917] text-[#1C1917] transition-all cursor-pointer"
                    >
                      <option>Scrum Software Development</option>
                      <option>Kanban</option>
                      <option>Task Tracking</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C] pointer-events-none" />
                  </div>
                </div>

                {/* Project Lead */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#A8A29E] uppercase tracking-wider">Project Lead</label>
                  <div className="relative">
                    <select
                      value={projectLead}
                      onChange={e => setProjectLead(e.target.value)}
                      className="w-full h-11 px-4 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl appearance-none focus:outline-none focus:ring-1 focus:ring-[#1C1917] text-[#78716C] transition-all cursor-pointer"
                    >
                      <option value="" disabled>Select a lead</option>
                      {employees.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716C] pointer-events-none" />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#A8A29E] uppercase tracking-wider">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the project goals and objectives..."
                    className="w-full h-32 px-4 py-3 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#1C1917] text-[#1C1917] placeholder:text-[#A8A29E] resize-none transition-all"
                  />
                </div>
              </div>

              {/* ---- RIGHT: Team member selection ---- */}
              <div className="lg:col-span-1 border-l border-[#E7E5E4] lg:pl-12">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-medium text-[#1C1917]">Add Team Members</h3>
                  <span className="text-xs text-[#78716C] bg-[#F5F5F4] px-2 py-1 rounded-md">
                    {selectedMembers.length} selected
                  </span>
                </div>

                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                  {loadingMembers ? (
                    <div className="text-center py-8 text-[#A8A29E] text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading team...
                    </div>
                  ) : (
                    employees.map(member => {
                      const isSelected = selectedMembers.includes(member.id);
                      // Fallback logic for initials if not in DB
                      const initials = member.name.substring(0, 2).toUpperCase();

                      return (
                        <div
                          key={member.id}
                          onClick={() => toggleMember(member.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected
                              ? 'bg-[#FAFAF9] border-[#1C1917] shadow-sm'
                              : 'bg-white border-transparent hover:bg-[#FAFAF9]'
                            }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-full border flex items-center justify-center text-xs font-medium shadow-sm transition-colors ${isSelected
                                ? 'bg-white border-[#E7E5E4] text-[#1C1917]'
                                : 'bg-[#F5F5F4] border-transparent text-[#78716C]'
                              }`}
                          >
                            {initials}
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${isSelected ? 'text-[#1C1917]' : 'text-[#78716C]'}`}>
                              {member.name}
                            </p>
                            <p className="text-xs text-[#A8A29E]">{member.role}</p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-[#1C1917] rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ---- Initial tasks table ---- */}
            <div className="mt-16 pt-8 border-t border-[#E7E5E4]">
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-lg font-medium text-[#1C1917]">Initial Project Plan</h3>
                  <p className="text-xs text-[#A8A29E] mt-1">
                    These tasks will be created under your new project instantly.
                  </p>
                </div>
                <div className="flex gap-2">
    
                  <Button
                    onClick={handleAddTask}
                    variant="outline"
                    className="bg-white border-[#E7E5E4] text-[#1C1917] hover:bg-[#FAFAF9] h-9 text-xs rounded-lg gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Task
                  </Button>
                </div>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-12 gap-4 px-6 py-2 text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider">
                <div className="col-span-3">Task Name</div>
                <div className="col-span-2">Assignee</div>
                <div className="col-span-1">Est. Hours</div>
                <div className="col-span-2">Start Date</div>
                <div className="col-span-2">Due Date</div>
                <div className="col-span-2">Timeline</div>
              </div>

              <div className="bg-[#FAFAF9] rounded-xl border border-[#E7E5E4] overflow-hidden">
                <div className="divide-y divide-[#E7E5E4]">
                  {tasks.map(task => (
                    <div key={task.id} className="grid grid-cols-12 gap-4 px-6 py-3 bg-white items-center">
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={task.name}
                          onChange={e => handleTaskChange(task.id, 'name', e.target.value)}
                          placeholder="Task name"
                          className="w-full text-sm bg-transparent focus:outline-none text-[#1C1917] placeholder:text-[#A8A29E]"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={task.assignee}
                          onChange={e => handleTaskChange(task.id, 'assignee', e.target.value)}
                          className="w-full text-sm bg-transparent focus:outline-none text-[#78716C]"
                        >
                          <option value="Unassigned">Unassigned</option>
                          {employees.map(m => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-1">
                        <input
                          type="number"
                          min="0"
                          value={task.hours}
                          onChange={e => handleTaskChange(task.id, 'hours', e.target.value)}
                          placeholder="Auto-calculated"
                          className="w-full text-sm bg-transparent focus:outline-none text-[#1C1917] placeholder:text-[#A8A29E] border-b border-transparent hover:border-[#E7E5E4] focus:border-[#1C1917] px-1 py-1"
                          title="Auto-calculated from dates (8 hours/day). Editable if needed."
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="date"
                          value={task.startDate}
                          onChange={e => handleTaskChange(task.id, 'startDate', e.target.value)}
                          className="w-full text-sm bg-transparent focus:outline-none text-[#1C1917]"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="date"
                          value={task.dueDate}
                          onChange={e => handleTaskChange(task.id, 'dueDate', e.target.value)}
                          className="w-full text-sm bg-transparent focus:outline-none text-[#1C1917]"
                        />
                      </div>
                      <div className="col-span-2 flex justify-between items-center">
                        <input
                          type="text"
                          value={task.timeline}
                          onChange={e => handleTaskChange(task.id, 'timeline', e.target.value)}
                          placeholder="Week 1"
                          className="w-full text-sm bg-transparent focus:outline-none text-[#1C1917] placeholder:text-[#A8A29E]"
                        />
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          disabled={tasks.length <= 1}
                          className="text-rose-400 hover:text-rose-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors ml-2"
                          title="Remove task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit row */}
            <div className="flex justify-end gap-3 mt-8">
              <Button variant="ghost" onClick={() => navigate('/projects')} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={isSubmitting || !projectName.trim() || !isValidProjectKey(projectKey)}
                className="bg-[#1C1917] text-white px-8 rounded-xl h-11 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Task Upload Dialog */}
      <TaskUploadDialog
        isOpen={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
        onTasksImported={handleTasksImported}
        employees={employees}
      />
    </VelocityAISidebar>
  );
}