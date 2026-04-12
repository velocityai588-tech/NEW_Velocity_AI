import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useJiraConnection } from '@/hooks/useJiraConnection';
import { LinearConnect } from '@/components/linear/LinearConnect';
import { GmailConnect } from '@/components/google/GmailConnect';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Plus, X, Copy, RefreshCw, Users, Loader2, Check, CalendarDays, Link2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { setupProgressService } from '@/services/setupProgressService';
import { generateInviteCode, generateInviteLink } from '@/lib/inviteCodeGenerator';

const SettingsScreen = () => {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'organization';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const { state: jiraConnectionState, connectingJira, disconnectingJira, connect: connectJira, disconnect: disconnectJira } = useJiraConnection();
  
  // Saving states for different tabs
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [addingHoliday, setAddingHoliday] = useState(false);

  // Data states
  const [orgData, setOrgData] = useState<any>(null);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);

  // Holiday Form State
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');

  // Team invite data
  const [teams, setTeams] = useState<any[]>([]);
  const [copiedTeamId, setCopiedTeamId] = useState<string | null>(null);
  const [copiedLinkTeamId, setCopiedLinkTeamId] = useState<string | null>(null);

  // Dummy states for UI elements not present in DB schema
  const [overloadThreshold, setOverloadThreshold] = useState(110);
  const [aiSettings, setAiSettings] = useState({ confidence: 70, health: 60, timelineRisk: 7 });

  // 1. Fetch live data on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userProfile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (userProfile?.organization_id) {
        const orgId = userProfile.organization_id;

        const [orgRes, holidayRes, jiraRes] = await Promise.all([
          supabase.from('organizations').select('*').eq('id', orgId).single(),
          supabase.from('holidays').select('*').eq('organization_id', orgId).order('date', { ascending: true }),
          supabase.from('jira_connections').select('*').eq('organization_id', orgId)
        ]);

        if (orgRes.data) setOrgData(orgRes.data);
        if (holidayRes.data) setHolidays(holidayRes.data);

        // Fetch teams with invite info
        const { data: teamData } = await supabase
          .from('teams')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: true });
        if (teamData) setTeams(teamData);

        setIntegrations([
          { name: 'Jira', description: 'Import projects and track tasks', connected: (jiraRes.data?.length ?? 0) > 0 },
          { name: 'Linear', description: 'Push approved AI tasks directly into Linear as issues', connected: false },
          { name: 'Asana', description: 'Sync project management data', connected: false },
          { name: 'Slack', description: 'Get notifications and updates', connected: false },
          { name: 'Google Calendar', description: 'Sync team schedules', connected: false },
          { name: 'Gmail / GSuite', description: 'Auto-sync action items from @firefly.ai and Gemini emails', connected: false },
        ]);
      }
    } catch (error) {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  // 2. Organization Update
  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: orgData.name,
          work_hours_per_week: orgData.work_hours_per_week,
          fiscal_year_start: orgData.fiscal_year_start,
          updated_at: new Date().toISOString()
        })
        .eq('id', orgData.id);

      if (error) throw error;
      toast.success("Organization settings updated");
      setupProgressService.markStepComplete(orgData.id, 'working_hours_configured');
    } catch (error) {
      toast.error("Update failed");
    } finally {
      setSavingOrg(false);
    }
  };

  // 3. Team Update
  const handleUpdateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTeam(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          target_utilization: orgData.target_utilization,
          updated_at: new Date().toISOString()
        })
        .eq('id', orgData.id);

      if (error) throw error;
      toast.success("Team settings updated");
    } catch (error) {
      toast.error("Update failed");
    } finally {
      setSavingTeam(false);
    }
  };

  // 4. AI Thresholds Update (Local state simulation since missing from schema)
  const handleUpdateAI = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAI(true);
    setTimeout(() => {
      toast.success("AI thresholds updated");
      setSavingAI(false);
    }, 600);
  };

  // 5. Holiday Management
  const handleAddHoliday = async () => {
    if (!newHolidayName || !newHolidayDate) {
      toast.error("Please provide both a name and date.");
      return;
    }
    setAddingHoliday(true);
    try {
      const { data, error } = await supabase
        .from('holidays')
        .insert({
          organization_id: orgData.id,
          name: newHolidayName,
          date: newHolidayDate
        })
        .select()
        .single();

      if (error) throw error;
      
      setHolidays([...holidays, data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setNewHolidayName('');
      setNewHolidayDate('');
      setShowHolidayForm(false);
      toast.success("Holiday added successfully");
      setupProgressService.markStepComplete(orgData.id, 'holidays_configured');
    } catch (error) {
      toast.error("Failed to add holiday");
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      const { error } = await supabase.from('holidays').delete().eq('id', holidayId);
      if (error) throw error;
      setHolidays(holidays.filter(h => h.id !== holidayId));
      toast.success("Holiday removed");
    } catch (error) {
      toast.error("Failed to remove holiday");
    }
  };

  // 6. Team Invite Code Management — client-side generation + direct Supabase update
  const regenerateTeamInvite = async (teamId: string, teamName: string) => {
    try {
      const newCode = generateInviteCode(teamName);
      const { data, error } = await supabase
        .from('teams')
        .update({
          invite_code: newCode,
          invite_is_active: true,
          invite_use_count: 0,
        })
        .eq('id', teamId)
        .select()
        .single();

      if (error) throw error;
      setTeams(prev => prev.map(t => t.id === teamId ? data : t));
      toast.success('Invite code regenerated');
    } catch (err) {
      console.error('Regenerate error:', err);
      toast.error('Failed to regenerate invite code');
    }
  };

  const copyTeamInviteCode = (teamId: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedTeamId(teamId);
    setTimeout(() => setCopiedTeamId(null), 2000);
    toast.success('Invite code copied!');
  };

  const copyTeamInviteLink = (teamId: string, code: string) => {
    const link = generateInviteLink(code);
    navigator.clipboard.writeText(link);
    setCopiedLinkTeamId(teamId);
    setTimeout(() => setCopiedLinkTeamId(null), 2000);
    toast.success('Invite link copied!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="p-12 relative min-h-screen">
      <div className="max-w-[1200px] mx-auto relative z-10">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-10 bg-white/70 backdrop-blur-xl border border-white/20 p-1.5 rounded-xl shadow-sm">
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="holidays">Holidays</TabsTrigger>
            <TabsTrigger value="ai-thresholds">AI Thresholds</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          {/* ===== TAB 1: ORGANIZATION SETTINGS ===== */}
          <TabsContent value="organization">
            <div className="bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-2xl p-10 shadow-sm">
              <h2 className="text-xl font-light text-[#1C1917] mb-8">Organization Settings</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <form onSubmit={handleUpdateOrg} className="space-y-6">
                  <div>
                    <Label className="text-sm font-light text-[#78716C] mb-2 block">Organization Name</Label>
                    <Input
                      value={orgData?.name || ""}
                      onChange={(e) => setOrgData({...orgData, name: e.target.value})}
                      className="h-11 rounded-xl border-white/20 bg-white/50 font-light"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-light text-[#78716C] mb-2 block">Default Work Hours Per Week</Label>
                    <Input
                      type="number"
                      value={orgData?.work_hours_per_week || 40}
                      onChange={(e) => setOrgData({...orgData, work_hours_per_week: parseInt(e.target.value)})}
                      className="h-11 rounded-xl border-white/20 bg-white/50 font-light"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-light text-[#78716C] mb-2 block">Fiscal Year Start</Label>
                    <select 
                      value={orgData?.fiscal_year_start || "january"}
                      onChange={(e) => setOrgData({...orgData, fiscal_year_start: e.target.value})}
                      className="w-full border border-white/20 bg-white/50 rounded-xl px-4 py-2.5 text-sm font-light h-11 text-[#292524]"
                    >
                      <option value="january">January</option>
                      <option value="april">April</option>
                      <option value="july">July</option>
                      <option value="october">October</option>
                    </select>
                  </div>

                  <Button type="submit" disabled={savingOrg} className="mt-8 bg-[#1C1917] text-white rounded-xl px-6 h-11">
                    {savingOrg ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save Changes
                  </Button>
                </form>

                {/* Team Invite Codes */}
                <div className="space-y-6 p-8 rounded-2xl bg-stone-50/50 border border-stone-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-[#1C1917]" />
                    <h3 className="text-sm font-medium text-[#1C1917]">Team Invite Codes</h3>
                  </div>
                  <p className="text-xs text-[#A8A29E] font-light -mt-3">Share these codes with new members to invite them to specific teams.</p>

                  {teams.length === 0 ? (
                    <p className="text-sm text-[#A8A29E] font-light py-4 text-center">No teams found.</p>
                  ) : (
                    <div className="space-y-3">
                      {teams.map(team => (
                        <div key={team.id} className="bg-white rounded-xl border border-stone-100 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-[#1C1917]">{team.name}</p>
                              <p className="text-[10px] text-[#A8A29E] font-light mt-0.5">
                                {team.invite_use_count || 0} member{(team.invite_use_count || 0) !== 1 ? 's' : ''} joined · Role: <span className="capitalize">{team.invite_role || 'employee'}</span>
                              </p>
                            </div>
                            <StatusBadge status={team.invite_is_active ? "Active" : "Inactive"} />
                          </div>

                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                readOnly
                                value={team.invite_code || 'None Set'}
                                className="h-10 pr-10 rounded-lg border-stone-100 bg-[#FAFAF9] font-mono text-xs tracking-wider"
                              />
                              <button
                                type="button"
                                onClick={() => team.invite_code && copyTeamInviteCode(team.id, team.invite_code)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8A29E] hover:text-[#1C1917]"
                              >
                                {copiedTeamId === team.id ? <Check className="w-4 h-4 text-[#0F766E]" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                            <Button
                              type="button"
                              onClick={() => team.invite_code && copyTeamInviteLink(team.id, team.invite_code)}
                              variant="outline"
                              className="h-10 px-3 rounded-lg border-stone-100 bg-white text-xs font-medium text-[#78716C] hover:text-[#1C1917]"
                              title="Copy invite link"
                            >
                              {copiedLinkTeamId === team.id ? <Check className="w-4 h-4 text-[#0F766E]" /> : <Link2 className="w-4 h-4" />}
                            </Button>
                            <Button
                              type="button"
                              onClick={() => regenerateTeamInvite(team.id, team.name)}
                              variant="outline"
                              className="h-10 w-10 p-0 rounded-lg border-stone-100 bg-white"
                              title="Regenerate invite code"
                            >
                              <RefreshCw className="w-4 h-4 text-[#78716C]" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ===== TAB 2: TEAM SETTINGS ===== */}
          <TabsContent value="team">
             <div className="bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-2xl p-10 shadow-sm">
                <h2 className="text-xl font-light text-[#1C1917] mb-8">Team Settings</h2>
                <form onSubmit={handleUpdateTeam} className="space-y-6 max-w-xl">
                   <div>
                     <Label className="text-sm font-light text-[#78716C] mb-2 block">Default Utilization Target</Label>
                     <Input 
                        type="number" 
                        value={orgData?.target_utilization || 85} 
                        onChange={(e) => setOrgData({...orgData, target_utilization: parseInt(e.target.value)})}
                        className="h-11 rounded-xl border-white/20 bg-white/50" 
                      />
                   </div>

                   <div>
                     <Label className="text-sm font-light text-[#78716C] mb-2 block">Overload Threshold (%)</Label>
                     <Input 
                        type="number" 
                        value={overloadThreshold} 
                        onChange={(e) => setOverloadThreshold(parseInt(e.target.value))}
                        className="h-11 rounded-xl border-white/20 bg-white/50" 
                      />
                   </div>

                   <Button type="submit" disabled={savingTeam} className="mt-8 bg-[#1C1917] text-white h-11 px-6 rounded-xl">
                     {savingTeam ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                     Save Changes
                   </Button>
                </form>
             </div>
          </TabsContent>

          {/* ===== TAB 3: COMPANY HOLIDAYS ===== */}
          <TabsContent value="holidays">
            <div className="bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-2xl p-10 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-light text-[#1C1917]">Company Holidays</h2>
                <Button onClick={() => setShowHolidayForm(!showHolidayForm)} size="sm" className="bg-[#1C1917] text-white rounded-xl px-5 h-10">
                  {showHolidayForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />} 
                  {showHolidayForm ? 'Cancel' : 'Add Holiday'}
                </Button>
              </div>

              {/* Add Holiday Form Toggle */}
              {showHolidayForm && (
                <div className="flex items-end gap-4 mb-8 p-6 bg-white/40 border-[0.5px] border-white/20 rounded-2xl">
                  <div className="flex-1">
                    <Label className="text-xs font-light text-[#78716C] mb-2 block">Holiday Name</Label>
                    <Input value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} placeholder="e.g. Thanksgiving" className="h-10 rounded-xl bg-white" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-light text-[#78716C] mb-2 block">Date</Label>
                    <Input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} className="h-10 rounded-xl bg-white" />
                  </div>
                  <Button onClick={handleAddHoliday} disabled={addingHoliday} className="h-10 px-6 rounded-xl bg-[#0F766E] hover:bg-[#0D655E] text-white">
                    {addingHoliday ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                {holidays.length > 0 ? (
                  holidays.map((holiday) => (
                    <div key={holiday.id} className="flex items-center justify-between py-4 px-5 bg-white/40 border-[0.5px] border-white/20 rounded-2xl">
                      <span className="text-sm text-[#1C1917] font-light">
                        {holiday.name} — {new Date(holiday.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <button onClick={() => handleDeleteHoliday(holiday.id)} className="text-[#A8A29E] hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-14 h-14 rounded-full bg-[#F5F5F4] flex items-center justify-center mb-4">
                      <CalendarDays className="w-6 h-6 text-[#D6D3D1]" />
                    </div>
                    <h3 className="text-sm font-medium text-[#1C1917] mb-1">No holidays added yet</h3>
                    <p className="text-xs text-[#78716C] font-light max-w-sm text-center mb-4">
                      Add your company holidays so project timelines and capacity planning account for time off.
                    </p>
                    <Button onClick={() => setShowHolidayForm(true)} size="sm" className="bg-[#1C1917] text-white rounded-xl px-5 h-9">
                      <Plus className="w-4 h-4 mr-1" /> Add Your First Holiday
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ===== TAB 4: AI THRESHOLDS ===== */}
          <TabsContent value="ai-thresholds">
             <div className="bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-2xl p-10 shadow-sm">
                <h2 className="text-xl font-light text-[#1C1917] mb-8">AI Threshold Settings</h2>
                <form onSubmit={handleUpdateAI} className="space-y-6 max-w-xl">
                   <div>
                     <Label className="text-sm font-light text-[#78716C] mb-2 block">Low Confidence Threshold (%)</Label>
                     <Input 
                       type="number" 
                       value={aiSettings.confidence} 
                       onChange={(e) => setAiSettings({...aiSettings, confidence: parseInt(e.target.value)})}
                       className="h-11 rounded-xl border-white/20 bg-white/50" 
                     />
                   </div>
                   
                   <div>
                     <Label className="text-sm font-light text-[#78716C] mb-2 block">Health Score Warning (%)</Label>
                     <Input 
                       type="number" 
                       value={aiSettings.health} 
                       onChange={(e) => setAiSettings({...aiSettings, health: parseInt(e.target.value)})}
                       className="h-11 rounded-xl border-white/20 bg-white/50" 
                     />
                   </div>

                   <div>
                     <Label className="text-sm font-light text-[#78716C] mb-2 block">Timeline Risk Days</Label>
                     <Input 
                       type="number" 
                       value={aiSettings.timelineRisk} 
                       onChange={(e) => setAiSettings({...aiSettings, timelineRisk: parseInt(e.target.value)})}
                       className="h-11 rounded-xl border-white/20 bg-white/50" 
                     />
                   </div>

                   <Button type="submit" disabled={savingAI} className="mt-8 bg-[#1C1917] text-white h-11 px-6 rounded-xl">
                     {savingAI ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                     Save Changes
                   </Button>
                </form>
             </div>
          </TabsContent>

          {/* ===== TAB 5: INTEGRATIONS ===== */}
          <TabsContent value="integrations">
            <div className="bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-2xl p-10 shadow-sm">
              <h2 className="text-xl font-light text-[#1C1917] mb-8">Integrations</h2>
              <div className="space-y-4">
                {integrations.map((integration, idx) => (
                  <div key={idx} className="flex items-center justify-between py-5 px-6 bg-white/40 border border-white/20 rounded-2xl">
                    <div>
                      <div className="text-[#292524] text-sm mb-1.5 font-light">{integration.name}</div>
                      <div className="text-xs text-[#78716C] font-light">{integration.description}</div>
                      {integration.name === 'Jira' && jiraConnectionState.connected && jiraConnectionState.siteName && (
                        <div className="text-xs text-[#0F766E] mt-2">
                          Connected to: <strong>{jiraConnectionState.siteName}</strong>
                        </div>
                      )}
                    </div>
                    {integration.name === 'Jira' ? (
                      <div className="flex items-center gap-4">
                        {integration.connected && (
                          <>
                            <StatusBadge status="Active" />
                            <Button 
                              onClick={disconnectJira}
                              disabled={disconnectingJira}
                              variant="outline" 
                              className="text-xs h-9 px-4 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                            >
                              {disconnectingJira ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                              Disconnect
                            </Button>
                          </>
                        )}
                        {!integration.connected && (
                          <Button 
                            onClick={connectJira}
                            disabled={connectingJira}
                            className="bg-[#1C1917] text-white h-9 px-5 rounded-xl"
                          >
                            {connectingJira ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                            Connect
                          </Button>
                        )}
                      </div>
                    ) : integration.name === 'Linear' ? (
                      <LinearConnect />
                    ) : integration.name.includes('Gmail') ? (
                      <GmailConnect />
                    ) : (
                      !integration.connected && (
                        <Button className="bg-[#1C1917] text-white h-9 px-5 rounded-xl">Connect</Button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
};

export default SettingsScreen;