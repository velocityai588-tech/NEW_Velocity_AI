import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PageSkeleton } from '@/components/shared/SkeletonLoader';
import { useDashboard } from '@/hooks/useDashboard';
import { IncompleteSetupBanner } from './dashboard/IncompleteSetupBanner';
import { ManagerEmptyDashboard } from './dashboard/ManagerEmptyDashboard';
import { useSetupProgress } from '@/hooks/useSetupProgress';
import { setupProgressService } from '@/services/setupProgressService';

// Icons
import CalendarToday from '@mui/icons-material/CalendarToday';
import Add from '@mui/icons-material/Add';
import ViewKanban from '@mui/icons-material/ViewKanban';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';

const getCurrentWeekMonday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
};

export const DashboardScreen = () => {
    const navigate = useNavigate();
    const { orgId, orgName } = useAuth();
    const { completedSteps, isLoading: setupLoading, fetchProgress } = useSetupProgress();

    // Fetch setup progress when org is available
    React.useEffect(() => {
        if (orgId) {
            fetchProgress(orgId);
        }
    }, [orgId, fetchProgress]);

    // Pulling dynamic data directly from your hook
    const {
        kpis, deadlines, gantt, isLoading,
        dateRangeParam, setDateRangeParam,
        tempCustomRange, setTempCustomRange,
        appliedCustomRange, setAppliedCustomRange,
        isCalendarOpen, setIsCalendarOpen,
    } = useDashboard();

    const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getCurrentWeekMonday());
    const [ganttFilterProject, setGanttFilterProject] = useState<string>('All');
    const [ganttSort, setGanttSort] = useState<string>('Name');

    const weekDays = useMemo(() => {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(currentWeekStart);
            date.setDate(currentWeekStart.getDate() + i);
            dates.push({ 
                date, 
                label: date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }), 
                isToday: new Date().toDateString() === date.toDateString() 
            });
        }
        return dates;
    }, [currentWeekStart]);

    const weekLabel = `Week ending ${format(new Date(currentWeekStart).setDate(currentWeekStart.getDate() + 6), "MMM d, yyyy")}`;

    const uniqueProjects = useMemo(() => {
        const projects = new Set<string>();
        if (Array.isArray(gantt)) {
            gantt.forEach((m: any) => {
                if (Array.isArray(m.tasks)) {
                    m.tasks.forEach((t: any) => t.project && projects.add(t.project));
                }
            });
        }
        return Array.from(projects).sort();
    }, [gantt]);

    const displayGantt = useMemo(() => {
        if (!Array.isArray(gantt)) return [];
        
        let filtered = gantt.map((member: any) => ({
            ...member, 
            tasks: ganttFilterProject === 'All' 
                ? member.tasks 
                : member.tasks.filter((t: any) => t.project === ganttFilterProject)
        })).filter((m: any) => {
            if (ganttFilterProject === 'All') return true;
            return m.tasks && m.tasks.length > 0;
        });

        return filtered.sort((a, b) => {
            if (ganttSort === 'Name') return (a.name || '').localeCompare(b.name || '');
            if (ganttSort === 'Role') return (a.role || '').localeCompare(b.role || '');
            return 0;
        });
    }, [gantt, ganttFilterProject, ganttSort]);

    const sortedDeadlines = useMemo(() => {
        if (!Array.isArray(deadlines)) return [];
        return [...deadlines].sort((a, b) => {
            const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
            const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
            return dateA - dateB;
        });
    }, [deadlines]);

    const KPICard = ({ label, value, trend, sublabel }: any) => (
        <div className="bg-white border border-[#E7E5E4]/80 rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:-translate-y-1.5 hover:border-[#2DD4BF]/30 transition-all duration-200 flex flex-col justify-between min-h-[140px]">
            <div>
                <div className="flex justify-between items-start mb-2">
                    <p className="text-[10px] font-semibold text-[#A8A29E] uppercase tracking-widest">{label}</p>
                    {trend && (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${trend === 'up' ? 'bg-[#F0FDFA] text-[#0F766E]' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
                            {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        </div>
                    )}
                </div>
                <h3 className="text-4xl font-light text-[#1C1917] mt-1 tabular-nums tracking-tight">{value !== undefined ? value : '--'}</h3>
            </div>
            <div className="h-4 mt-2">
                {sublabel && <p className="text-xs font-medium text-[#A8A29E]">{sublabel}</p>}
            </div>
        </div>
    );

    if (isLoading || setupLoading) return <PageSkeleton />;

    // Show full empty state when no setup steps have been completed yet
    if (!setupProgressService.isComplete(completedSteps) && completedSteps.length === 0) {
        return (
            <div className="p-8 relative max-w-[1600px] mx-auto bg-[#FAFAF9] min-h-screen">
                <ManagerEmptyDashboard orgName={orgName} completedSteps={completedSteps} />
            </div>
        );
    }

    return (
        <div className="p-8 relative max-w-[1600px] mx-auto bg-[#FAFAF9] min-h-screen">

            {/* Setup completion banner — shown when some steps are done but not all */}
            <IncompleteSetupBanner />

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-light text-[#1C1917]">Dashboard</h2>
                    <p className="text-[#78716C] text-sm mt-1">Overview of your team's capacity and project health.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                        <div>
                            <Select value={dateRangeParam} onValueChange={(val) => {
                                setDateRangeParam(val);
                                if (val === 'custom') setIsCalendarOpen(true);
                            }}>
                                <SelectTrigger className="w-[160px] h-10 bg-white border-[#E7E5E4] rounded-lg shadow-sm font-medium text-sm text-[#1C1917]">
                                    <CalendarToday style={{ fontSize: 16 }} className="mr-2 text-[#78716C]" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white border-[#E7E5E4] rounded-lg">
                                    <SelectItem value="30">Last 30 Days</SelectItem>
                                    <SelectItem value="90">Last 90 Days</SelectItem>
                                    <SelectItem value="custom">Custom Range</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <PopoverContent className="w-auto p-4 bg-white shadow-xl rounded-2xl border-[#E7E5E4]" align="end">
                            <Calendar mode="range" selected={tempCustomRange} onSelect={setTempCustomRange} numberOfMonths={2} className="mb-4" />
                            <div className="flex justify-end gap-2 pt-4 border-t border-[#E7E5E4]">
                                <Button variant="ghost" onClick={() => setIsCalendarOpen(false)}>Cancel</Button>
                                <Button 
                                    className="bg-[#1C1917] text-white hover:bg-[#292524] rounded-lg"
                                    onClick={() => { setAppliedCustomRange(tempCustomRange); setIsCalendarOpen(false); }}
                                >
                                    Apply
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <Button className="bg-[#1C1917] text-white h-10 px-4 rounded-lg shadow-sm font-medium hover:bg-[#292524]" onClick={() => navigate('/projects/create')}>
                        <Add style={{ fontSize: 18 }} className="mr-1.5" /> New Project
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
                
                <div className="col-span-12 xl:col-span-10 space-y-6">
                    
                    <div className="grid grid-cols-4 gap-4">
                        {kpis.length > 0 ? (
                            kpis.map((kpi: any, i: number) => <KPICard key={i} {...kpi} />)
                        ) : (
                            Array(4).fill(0).map((_, i) => <KPICard key={i} label="Loading Data" value="--" />)
                        )}
                    </div>

                    <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 shadow-sm">
                        <div className="flex flex-col mb-6">
                            <div className="flex justify-between items-center w-full">
                                <h2 className="text-xl font-medium text-[#1C1917]">Team Capacity & Allocation</h2>
                                <div className="flex items-center gap-3">
                                    <Select value={ganttFilterProject} onValueChange={setGanttFilterProject}>
                                        <SelectTrigger className="h-9 w-[120px] text-xs font-semibold bg-white border-[#E7E5E4] rounded-full shadow-sm text-[#78716C]">
                                            <SelectValue placeholder="Filter" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white rounded-md">
                                            <SelectItem value="All">All Projects</SelectItem>
                                            {uniqueProjects.map(p => <SelectItem key={p as string} value={p as string}>{p as string}</SelectItem>)}
                                        </SelectContent>
                                    </Select>

                                    <Select value={ganttSort} onValueChange={setGanttSort}>
                                        <SelectTrigger className="h-9 w-[100px] text-xs font-semibold bg-white border-[#E7E5E4] rounded-full shadow-sm text-[#78716C]">
                                            <SelectValue placeholder="Sort" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white rounded-md">
                                            <SelectItem value="Name">Name</SelectItem>
                                            <SelectItem value="Role">Role</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-1 bg-white border border-[#E7E5E4] rounded-full p-1 shadow-sm h-9">
                                        <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-[#F5F5F4] rounded-full text-[#78716C]" onClick={() => setCurrentWeekStart(new Date(new Date(currentWeekStart).setDate(currentWeekStart.getDate() - 7)))}>
                                            <ChevronLeftIcon style={{ fontSize: 16 }} />
                                        </Button>
                                        <span className="text-[11px] font-bold px-3 text-[#1C1917] uppercase tracking-wider whitespace-nowrap">{format(currentWeekStart, "MMM yyyy")}</span>
                                        <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-[#F5F5F4] rounded-full text-[#78716C]" onClick={() => setCurrentWeekStart(new Date(new Date(currentWeekStart).setDate(currentWeekStart.getDate() + 7)))}>
                                            <ChevronRightIcon style={{ fontSize: 16 }} />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-6 mt-6 mb-2 text-xs font-semibold text-[#78716C]">
                                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#0F766E]"></div> On Track</div>
                                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#EAB308]"></div> At Risk</div>
                                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#E7E5E4]"></div> Available</div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <div className="min-w-[700px]">
                                <div className="flex gap-1 border-b border-[#E7E5E4] pb-3 mb-3 text-[#A8A29E] text-[10px] font-bold uppercase tracking-wider">
                                    <div className="w-56 pl-2">Team Member</div>
                                    <div className="flex flex-1 gap-2">
                                        {weekDays.map((day, i) => (
                                            <div key={i} className={`flex-1 text-center py-1 ${day.isToday ? 'text-[#0F766E] bg-[#F0FDFA] rounded-md font-bold' : ''}`}>
                                                
                                                {day.label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    {displayGantt.length === 0 ? (
                                        <div className="text-center py-12 text-sm text-[#78716C]">
                                            {ganttFilterProject === 'All' 
                                                ? 'No team members found.' 
                                                : 'No members allocated to this project.'}
                                        </div>
                                    ) : (
                                        displayGantt.map((member: any) => {
                                            const viewStart = new Date(weekDays[0].date); viewStart.setHours(0, 0, 0, 0);
                                            const viewEnd = new Date(weekDays[6].date); viewEnd.setHours(23, 59, 59, 999);

                                            const validTasks = member.tasks.filter((task: any) => {
                                                if (!task.startDate || !task.endDate) return false;
                                                const tStart = new Date(task.startDate); const tEnd = new Date(task.endDate);
                                                tStart.setHours(0, 0, 0, 0); tEnd.setHours(23, 59, 59, 999);
                                                return !(tEnd < viewStart || tStart > viewEnd);
                                            });

                                            const rowHeight = Math.max(56, validTasks.length * 36 + 20);

                                            return (
                                                <div key={member.id} className="flex items-stretch gap-1 group hover:bg-[#FAFAF9] rounded-xl transition-colors p-2 -mx-2" style={{ height: `${rowHeight}px` }}>
                                                    <div className="w-56 flex-shrink-0 flex items-center gap-3 pr-4 border-r border-[#E7E5E4]/50 z-20 bg-white group-hover:bg-[#FAFAF9] transition-colors">
                                                        <Avatar className="w-10 h-10 border border-[#E7E5E4]">
                                                            <AvatarFallback className="bg-[#F5F5F4] text-[#1C1917] text-xs font-semibold">{member.avatar}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold text-[#1C1917] truncate">{member.name}</div>
                                                            <div className="text-[11px] font-medium text-[#78716C] truncate mt-0.5">{member.role}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 ml-2 relative w-full h-full">
                                                        <div className="absolute inset-x-0 inset-y-0 flex gap-2 pointer-events-none z-0">
                                                            {weekDays.map((_, dayIdx) => (
                                                                <div key={dayIdx} className="flex-1 min-w-[100px] h-full relative">
                                                                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#E7E5E4]/40"></div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="absolute inset-0">
                                                            {validTasks.map((task: any, vIdx: number) => {
                                                                const tStart = new Date(task.startDate); const tEnd = new Date(task.endDate);
                                                                tStart.setHours(0, 0, 0, 0); tEnd.setHours(23, 59, 59, 999);

                                                                const visibleStart = new Date(Math.max(tStart.getTime(), viewStart.getTime()));
                                                                const visibleEnd = new Date(Math.min(tEnd.getTime(), viewEnd.getTime()));
                                                                const msInDay = 1000 * 60 * 60 * 24;
                                                                
                                                                const offsetDays = Math.floor((visibleStart.getTime() - viewStart.getTime()) / msInDay);
                                                                const durationDays = Math.floor((visibleEnd.getTime() - visibleStart.getTime()) / msInDay) + 1;

                                                                const leftPercent = (offsetDays / 7) * 100;
                                                                const widthPercent = (durationDays / 7) * 100;

                                                                return (
                                                                    <div
                                                                        key={vIdx}
                                                                        className={`absolute h-7 text-[11px] font-semibold flex items-center px-4 shadow-sm border cursor-pointer z-10 transition-all rounded-full
                                                                        ${task.displayStatus === 'track' ? 'bg-[#F0FDFA] text-[#0F766E] border-[#CCFBF1]' : 
                                                                          task.displayStatus === 'leave' ? 'bg-[#FAFAF9] text-[#78716C] border-[#E7E5E4]' : 
                                                                          'bg-[#FFF7ED] text-[#C2410C] border-[#FFEDD5]'}
                                                                        `}
                                                                        style={{ 
                                                                            left: `calc(${leftPercent}%)`, 
                                                                            width: `calc(${widthPercent}%)`, 
                                                                            top: `${10 + vIdx * 36}px`,
                                                                            backgroundImage: task.displayStatus === 'leave' && task.status === 'pending'
                                                                                ? 'linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 50%, #f3f4f6 50%, #f3f4f6 75%, transparent 75%, transparent)' 
                                                                                : 'none',
                                                                            backgroundSize: '10px 10px'
                                                                        }}
                                                                    >
                                                                        <span className="truncate w-full relative z-20 text-center">{task.project}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-[#E7E5E4] rounded-2xl p-8 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-medium text-[#1C1917]">Upcoming Deadlines</h2>
                            <span className="text-xs font-bold text-[#A8A29E] uppercase tracking-wider cursor-pointer hover:text-[#1C1917] transition-colors">View All</span>
                        </div>
                        <div className="space-y-4">
                            {sortedDeadlines.length === 0 ? (
                                <div className="text-center py-8 text-sm text-[#78716C]">No upcoming project deadlines.</div>
                            ) : sortedDeadlines.map((item: any) => (
                                <Link to={`/projects/${item.id}`} key={item.id} className="flex items-center justify-between py-4 px-6 bg-[#FAFAF9] border border-[#E7E5E4] rounded-2xl hover:bg-white hover:shadow-md transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl border border-[#E7E5E4] flex items-center justify-center bg-white text-[#78716C] group-hover:text-[#1C1917] transition-colors shadow-sm">
                                            <ViewKanban style={{ fontSize: 20 }} />
                                        </div>
                                        <div>
                                            <div className="text-[15px] font-semibold text-[#1C1917] mb-1">{item.project}</div>
                                            <div className="text-xs font-medium text-[#78716C]">
                                                {item.deadline ? format(new Date(item.deadline), "MMM d, yyyy") : 'No Deadline'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-10">
                                        <div className="text-center flex flex-col items-center min-w-[60px]">
                                            <span className="text-sm font-bold text-[#1C1917]">{item.daysLeft} days</span>
                                            <span className="text-[9px] font-bold text-[#A8A29E] uppercase tracking-wider mt-0.5">Remaining</span>
                                        </div>
                                        <div className={`px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider
                                            ${item.status === 'At Risk' ? 'bg-[#FEF2F2] text-[#DC2626]' : 
                                              item.status === 'Active' ? 'bg-[#F0FDFA] text-[#0F766E]' : 
                                              'bg-[#F1F5F9] text-[#64748B]'}`}>
                                            {item.status}
                                        </div>
                                        <ChevronRightIcon style={{ fontSize: 20 }} className="text-[#D6D3D1] group-hover:text-[#1C1917] transition-colors" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="col-span-12 xl:col-span-2">
                    <div className="bg-white border border-[#E7E5E4] rounded-2xl p-3 shadow-sm h-full">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="text-[#0F766E]" size={16} />
                            <h2 className="text-sm font-semibold text-[#1C1917]">Insights</h2>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <Sparkles className="text-[#D6D3D1] mb-1" size={20} />
                            <p className="text-xs font-medium text-[#78716C] mb-1">No insights yet</p>
                            <p className="text-xs text-[#A8A29E] max-w-[140px]">
                                Coming soon
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};