import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { ML_ENGINE_URL } from '../../lib/api-config';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ThumbUpOutlined from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlined from '@mui/icons-material/ThumbDownOutlined';

const ALLOWED_ROLES = [
    'lead', 'member', 'Engineer', 'Designer', 'Product Manager',
    'Engineering Manager', 'QA Engineer', 'Data Scientist',
    'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
    'DevOps Engineer'
];

const mapRole = (role: string): string => {
    const match = ALLOWED_ROLES.find(r => r.toLowerCase() === role.toLowerCase());
    if (match) return match;
    if (role.toLowerCase().includes('frontend')) return 'Frontend Developer';
    if (role.toLowerCase().includes('backend')) return 'Backend Developer';
    if (role.toLowerCase().includes('designer')) return 'Designer';
    if (role.toLowerCase().includes('engineer')) return 'Engineer';
    if (role.toLowerCase().includes('product manager')) return 'Product Manager';
    return 'member';
};

// Fire-and-forget RL feedback — never blocks the UI
const sendRLFeedback = async (
    userId: string,
    taskName: string,
    reward: number,
    orgId: string,
    member: any
) => {
    if (!ML_ENGINE_URL) return;
    try {
        await fetch(`${ML_ENGINE_URL}/api/v1/planner/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                task_name: taskName,
                reward,
                org_id: orgId,
                skill_match_score: (member.match_percentage || 70) / 100,
                capacity_pct: member.remaining_capacity_hours
                    ? Math.min(1, member.remaining_capacity_hours / 160)
                    : 0.8,
                current_load_pct: member.current_load != null
                    ? Math.min(1, member.current_load / 100)
                    : 0.5,
                role_match: 1.0,
                jira_history_count: 0.5,
                leave_risk: 0.0,
            }),
        });
        console.log(`[RL] Feedback sent: user=${userId} reward=${reward}`);
    } catch (e) {
        console.warn('[RL] Feedback failed (non-blocking):', e);
    }
};

export const AllocateTeamScreen = () => {
    const { state } = useLocation();
    const navigate = useNavigate();
    const { tasks, projectTitle, projectDescription, currentOrgId } = state || {};

    const [isMatchingTeam, setIsMatchingTeam] = useState(true);
    const [recommendedTeam, setRecommendedTeam] = useState<any[]>([]);
    const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!state?.tasks) {
            toast.error("No project context found");
            navigate('/plan-project');
            return;
        }
        performAllocation();
    }, []);

    const performAllocation = async () => {
        if (!ML_ENGINE_URL) {
            toast.error("ML Engine URL is not configured. Please check your .env file.");
            setIsMatchingTeam(false);
            return;
        }

        try {
            console.log(`[AllocateTeam] Connecting to: ${ML_ENGINE_URL}/api/v1/planner/allocate`);
            const response = await fetch(`${ML_ENGINE_URL}/api/v1/planner/allocate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    org_id: currentOrgId,
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: new Date(Date.now() + 2592000000).toISOString().split('T')[0],
                    tasks: tasks.map((t: any) => ({
                        task_name: t.task,
                        estimated_hours: t.estimatedHours,
                        required_skills: t.requiredSkills || [],
                        task_description: t.task
                    }))
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[AllocateTeam] Allocation request failed:', response.status, errorData);
                throw new Error(errorData.detail || `HTTP ${response.status}: Allocation failed`);
            }

            const data = await response.json();
            const team = data.recommended_team || [];

            if (team.length === 0) {
                toast.info("No matching team members found for these tasks.");
            }

            setRecommendedTeam(team);
            setSelectedTeamIds(team.map((m: any) => m.id));
        } catch (err: any) {
            console.error('[AllocateTeam] Error:', err);
            toast.error(err.message || "Allocation failed. Check engine connectivity.");
        } finally {
            setIsMatchingTeam(false);
        }
    };

    // Manager explicitly rejects a suggestion — train RL with -1
    const handleReject = (member: any) => {
        setSelectedTeamIds(prev => prev.filter(id => id !== member.id));
        setRejectedIds(prev => new Set([...prev, member.id]));

        // Fire RL reject signal for each task this member was assigned
        const memberTasks = member.task_fit || [projectTitle || 'Project Task'];
        memberTasks.forEach((taskName: string) => {
            sendRLFeedback(member.id, taskName, -1, currentOrgId, member);
        });

        toast(`Rejected ${member.name} — AI will learn from this`, { duration: 2000 });
    };

    const handleCommit = async () => {
        if (selectedTeamIds.length === 0) return toast.error("Select team members");
        setIsSaving(true);
        try {
            // 1. Create the Team
            const { data: team, error: teamErr } = await supabase.from('teams')
                .insert({ organization_id: currentOrgId, name: `${projectTitle || 'AI'} Team` })
                .select().single();
            if (teamErr) throw teamErr;

            // 2. Create the Project
            const { data: proj, error: projErr } = await supabase.from('projects').insert({
                organization_id: currentOrgId,
                team_id: team.id,
                name: projectTitle || "New Project",
                description: projectDescription,
                status: 'active',
                source: 'internal',
                start_date: new Date().toISOString().split('T')[0],
                allocated_team_members: selectedTeamIds
            }).select().single();
            if (projErr) throw projErr;

            // 3. Create Team Members entries
            const teamMembersToInsert = selectedTeamIds.map(uid => ({
                team_id: team.id,
                user_id: uid,
                role: mapRole(recommendedTeam.find(m => m.id === uid)?.role || 'member')
            }));
            await supabase.from('team_members').insert(teamMembersToInsert);

            // 4. Insert Tasks WITH Assignees
            const tasksToInsert = tasks.map((t: any) => {
                const assignee = recommendedTeam.find(m =>
                    selectedTeamIds.includes(m.id) && m.task_fit.includes(t.task)
                );
                return {
                    project_id: proj.id,
                    name: t.task,
                    estimated_hours: t.estimatedHours,
                    status: 'not_started',
                    assignee_id: assignee ? assignee.id : null
                };
            });
            await supabase.from('tasks').insert(tasksToInsert);

            // 5. Fire RL approve signals for all confirmed members (fire-and-forget)
            const approvedMembers = recommendedTeam.filter(m => selectedTeamIds.includes(m.id));
            approvedMembers.forEach(member => {
                const memberTasks = member.task_fit || [projectTitle || 'Project Task'];
                memberTasks.forEach((taskName: string) => {
                    sendRLFeedback(member.id, taskName, 1, currentOrgId, member);
                });
            });

            toast.success("Project launched successfully!");
            navigate(`/projects/${proj.id}`);
        } catch (e) {
            toast.error("Failed to launch");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="p-12 min-h-screen bg-[#FAFAF9]">
            <div className="max-w-[1200px] mx-auto">
                <div className="mb-10 flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowBackOutlined />
                    </Button>
                    <h1 className="text-3xl font-light">Launch & Allocate</h1>
                </div>

                {isMatchingTeam ? (
                    <div className="p-20 text-center bg-white rounded-3xl border border-dashed border-[#E7E5E4]">
                        <SyncOutlined className="animate-spin mb-4 text-[#0F766E]" />
                        <p className="text-[#78716C]">AI is matching skills to project requirements...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-12 gap-8">
                        <div className="col-span-8 grid grid-cols-2 gap-6">
                            {recommendedTeam.map((m) => {
                                const isSelected = selectedTeamIds.includes(m.id);
                                const isRejected = rejectedIds.has(m.id);
                                return (
                                    <div
                                        key={m.id}
                                        onClick={() => !isRejected && setSelectedTeamIds(p =>
                                            isSelected ? p.filter(id => id !== m.id) : [...p, m.id]
                                        )}
                                        className={`p-6 rounded-2xl border transition-all cursor-pointer ${
                                            isRejected
                                                ? 'bg-gray-50 border-gray-200 opacity-50'
                                                : isSelected
                                                ? 'bg-white border-[#0F766E] shadow-lg'
                                                : 'bg-white/50 border-[#E7E5E4]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar>
                                                    <AvatarFallback>{m.avatar}</AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <h4 className="text-sm font-medium">{m.name}</h4>
                                                    <p className="text-[10px] text-[#78716C] uppercase">{m.role}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {isSelected && !isRejected && (
                                                    <CheckCircleOutlined className="text-[#0F766E]" />
                                                )}
                                                {/* Reject button — trains RL with -1 */}
                                                {!isRejected && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleReject(m); }}
                                                        className="ml-1 p-1 text-gray-300 hover:text-red-400 transition-colors"
                                                        title="Reject suggestion — AI will learn"
                                                    >
                                                        <ThumbDownOutlined style={{ fontSize: 16 }} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mb-4 flex flex-wrap gap-1">
                                            {m.task_fit.map((t: string, i: number) => (
                                                <span key={i} className="px-2 py-0.5 bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1] rounded text-[9px] font-medium">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                        {/* Confidence Score */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 flex-1 w-24 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-500 rounded-full"
                                                        style={{ width: `${Math.round(m.match_percentage || m.skill_match_score * 100 || 70)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-semibold text-emerald-700">
                                                    {Math.round(m.match_percentage || m.skill_match_score * 100 || 70)}% match
                                                </span>
                                            </div>
                                            {m.remaining_capacity_hours != null && (
                                                <span className="text-[10px] text-[#78716C]">
                                                    {Math.round(m.remaining_capacity_hours)}h free
                                                </span>
                                            )}
                                        </div>
                                        <div className="p-3 bg-emerald-50 rounded-xl text-[11px] italic text-[#44403C]">
                                            "{m.justification}"
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="col-span-4 space-y-6">
                            <div className="bg-white p-8 rounded-2xl border border-[#E7E5E4] sticky top-24 shadow-sm">
                                <h3 className="text-xs font-bold mb-6 text-[#A8A29E] uppercase tracking-widest">
                                    Summary
                                </h3>
                                <div className="space-y-4 mb-10">
                                    <div className="flex justify-between border-b pb-2">
                                        <p className="text-sm text-[#78716C]">Selected Team</p>
                                        <p className="text-sm font-medium">{selectedTeamIds.length}</p>
                                    </div>
                                    <div className="flex justify-between border-b pb-2">
                                        <p className="text-sm text-[#78716C]">Project Tasks</p>
                                        <p className="text-sm font-medium">{tasks.length}</p>
                                    </div>
                                    {rejectedIds.size > 0 && (
                                        <div className="flex justify-between border-b pb-2">
                                            <p className="text-sm text-[#78716C]">AI Rejections</p>
                                            <p className="text-sm font-medium text-red-500">{rejectedIds.size} learned</p>
                                        </div>
                                    )}
                                </div>
                                {rejectedIds.size > 0 && (
                                    <p className="text-xs text-gray-400 mb-4 text-center">
                                        ✦ AI will improve future suggestions based on your rejections
                                    </p>
                                )}
                                <Button
                                    className="w-full h-12 text-white"
                                    style={{ background: 'linear-gradient(135deg, #1C1917, #0F766E)' }}
                                    onClick={handleCommit}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <SyncOutlined className="animate-spin mr-2" /> : 'Confirm & Launch'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
