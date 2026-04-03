import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Progress } from './ui/progress';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from './ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from './ui/select';
import AddOutlined from '@mui/icons-material/AddOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { AISuggestionPanel, type AISuggestion } from './AISuggestionCard';
import { FormError, validators } from './shared/FormError';
import { LoadingButton } from './shared/LoadingButton';
import { PageSkeleton } from './shared/SkeletonLoader';
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading';
import { supabase } from '@/lib/supabase';
import { getCurrentOrgId } from '@/lib/orgContext';
import { peopleService } from '../services/peopleService';
import { setupProgressService } from '../services/setupProgressService';
import { PeopleEmptyState } from './people/PeopleEmptyState';
import { useVoice } from '@/contexts/VoiceContext';
import { findBestMatch } from '@/lib/utils';
import { roleService } from '../services/roleService';
import type { TeamMemberView, PendingSkillView, PersonDetailView } from '../types';

const UtilizationBar = ({ value }: { value: number }) => {
    const color = value > 110 ? 'bg-[#1C1917]/30' : value > 90 ? 'bg-[#1C1917]/20' : 'bg-[#1C1917]/15';
    const width = Math.min(value, 150);

    return (
        <div className="w-full bg-[#F5F5F4] rounded-full h-1.5 overflow-hidden">
            <div
                className={`h-full ${color} transition-all duration-500`}
                style={{ width: `${width}%` }}
            />
        </div>
    );
};

const AddTeamMemberModal = ({ 
    open, 
    onOpenChange, 
    onMemberAdded,
    initialData,
    activeTeamId
}: { 
    open: boolean; 
    onOpenChange: (open: boolean) => void; 
    onMemberAdded?: () => void;
    initialData?: { name?: string; email?: string; role?: string } | null;
    activeTeamId: string | null;
}) => {
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [customRole, setCustomRole] = useState('');
    const [isCustomRole, setIsCustomRole] = useState(false);
    const [email, setEmail] = useState('');
    const [skills, setSkills] = useState('');
    const [utilization, setUtilization] = useState(85);
    const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
    const [memberAttempted, setMemberAttempted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCSVMode, setIsCSVMode] = useState(false);
    const [csvData, setCSVData] = useState<string>('');
    const [csvInputMode, setCSVInputMode] = useState<'upload' | 'paste'>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial fill from voice or profile
    useEffect(() => {
        if (open && initialData) {
            console.log('[AddTeamMemberModal] Pre-filling with:', initialData);
            if (initialData.name) setName(initialData.name);
            if (initialData.email) setEmail(initialData.email);
            if (initialData.role) {
                const incomingRole = initialData.role.toLowerCase().trim();
                const allRoles = roleService.getRoles();
                const matchedRole = allRoles.find(r => r.toLowerCase() === incomingRole);
                
                if (matchedRole) {
                    setRole(matchedRole);
                    setIsCustomRole(false);
                    // Also set skills if found
                    const suggestedSkills = roleService.getSkillsForRole(matchedRole);
                    if (suggestedSkills.length > 0) setSkills(suggestedSkills.join(', '));
                } else {
                    setCustomRole(initialData.role);
                    setIsCustomRole(true);
                }
            }
        }
    }, [open, initialData]);

    // Process CSV / Excel file
    const processFile = (file: File) => {
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        const isCsv = file.name.endsWith('.csv') || file.type.includes('text');

        if (!isCsv && !isExcel) {
            toast.error('Please upload a valid CSV or Excel file');
            return;
        }

        const reader = new FileReader();
        if (isExcel) {
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const wb = XLSX.read(data, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                    
                    // Convert back to simple CSV string for parseCSV
                    const csvString = json.map(row => row.map(v => (v ?? '').toString()).join(',')).join('\n');
                    setCSVData(csvString);
                    toast.success('Excel file loaded successfully');
                } catch (error) {
                    toast.error('Failed to read Excel file');
                    console.error('Excel read error:', error);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    setCSVData(content);
                    toast.success('CSV file loaded successfully');
                } catch (error) {
                    toast.error('Failed to read CSV file');
                }
            };
            reader.readAsText(file);
        }
    };

    // Handle CSV / Excel file upload
    const handleCSVFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) processFile(file);
    };

    // Handle drag and drop
    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const validateMember = () => {
        const errors: Record<string, string> = {};
        const nameErr = validators.required(name, 'Full name');
        if (nameErr) errors.name = nameErr;
        const emailErr = validators.email(email);
        if (emailErr) errors.email = emailErr;
        const finalRole = isCustomRole ? customRole.trim() : role;
        if (!finalRole) errors.role = 'Please select or enter a role';
        setMemberErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Parse CSV and return array of members
    const parseCSV = (csv: string) => {
        const lines = csv.trim().split('\n');
        if (lines.length < 2) {
            toast.error('CSV must have header row and at least one data row');
            return [];
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const members = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            if (values.every(v => !v)) continue; // Skip empty lines

            const member: any = {};
            headers.forEach((header, idx) => {
                member[header] = values[idx] || '';
            });

            members.push(member);
        }

        return members;
    };

    // Handle bulk import from CSV
    const handleCSVImport = async () => {
        if (!csvData.trim()) {
            toast.error('Please paste CSV data');
            return;
        }

        setIsSubmitting(true);
        try {
            const orgId = getCurrentOrgId();
            if (!orgId) {
                toast.error('Organization not found');
                return;
            }

            // Use activeTeamId if available, otherwise fallback to first team
            const targetTeamId = activeTeamId;
            let teamId = targetTeamId;

            if (!teamId) {
                const { data: teams, error: teamsError } = await supabase
                    .from('teams')
                    .select('id')
                    .eq('organization_id', orgId)
                    .limit(1);

                if (teamsError || !teams || teams.length === 0) {
                    toast.error('No team found for your organization. Please create a team first.');
                    return;
                }
                teamId = teams[0].id;
            }
            const members = parseCSV(csvData);

            if (members.length === 0) {
                toast.error('No valid members found in CSV');
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            for (const member of members) {
                try {
                    const memberName = member.name || member.full_name || '';
                    const memberEmail = member.email || '';
                    const memberRole = member.role || 'member';
                    const memberSkills = member.skills || '';
                    const memberUtilization = parseInt(member.utilization || '85');

                    if (!memberName || !memberEmail) {
                        console.warn('Skipping row - missing name or email');
                        errorCount++;
                        continue;
                    }

                    await peopleService.addTeamMember(orgId, teamId, {
                        name: memberName,
                        email: memberEmail,
                        role: memberRole,
                        skills: memberSkills,
                        utilizationPercent: memberUtilization,
                    });

                    successCount++;
                } catch (error) {
                    console.error('Error adding member from CSV:', error);
                    errorCount++;
                }
            }

            toast.success(`${successCount} member(s) added successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
            
            // Reset
            setCSVData('');
            setIsCSVMode(false);
            onOpenChange(false);
            onMemberAdded?.();
        } catch (error) {
            console.error('[AddTeamMemberModal] Error bulk importing:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to import members';
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Download sample CSV
    const downloadSampleCSV = () => {
        const sampleData = `name,email,role,skills,utilization
John Doe,john.doe@company.com,Frontend Developer,React React Native TypeScript,85
Jane Smith,jane.smith@company.com,Backend Developer,Node.js Python PostgreSQL,90
Bob Johnson,bob.johnson@company.com,Full Stack Developer,React Node.js MongoDB,80
Alice Williams,alice.williams@company.com,Product Designer,Figma Design Systems UI/UX,75
Charlie Brown,charlie.brown@company.com,QA Engineer,Selenium Jest Testing,70`;

        const blob = new Blob([sampleData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sample_team_members.csv';
        link.click();
        window.URL.revokeObjectURL(url);
    };

    const handleAddMember = async () => {
        setMemberAttempted(true);
        if (!validateMember()) return;

        setIsSubmitting(true);
        try {
            const orgId = getCurrentOrgId();
            if (!orgId) {
                toast.error('Organization not found');
                return;
            }

            // Use activeTeamId if available, otherwise fallback to first team
            const targetTeamId = activeTeamId;
            let teamId = targetTeamId;

            if (!teamId) {
                const { data: teams, error: teamsError } = await supabase
                    .from('teams')
                    .select('id')
                    .eq('organization_id', orgId)
                    .limit(1);

                if (teamsError || !teams || teams.length === 0) {
                    toast.error('No team found for your organization. Please create a team first.');
                    return;
                }
                teamId = teams[0].id;
            }
            const finalRole = isCustomRole ? customRole.trim() : role;

            // Add team member
            const result = await peopleService.addTeamMember(orgId, teamId, {
                name,
                email,
                role: finalRole,
                skills,
                utilizationPercent: utilization,
            });

            console.log('[AddTeamMemberModal] Team member added:', result);
            toast.success('Team member added successfully');
            
            // Reset form
            setName('');
            setEmail('');
            setRole('');
            setCustomRole('');
            setIsCustomRole(false);
            setSkills('');
            setUtilization(85);
            setMemberErrors({});
            setMemberAttempted(false);
            
            onOpenChange(false);
            onMemberAdded?.();
        } catch (error) {
            console.error('[AddTeamMemberModal] Error adding team member:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to add team member';
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined} className="max-w-2xl bg-[#FDFDFB] p-0 gap-0">
                <DialogHeader className="px-8 py-6 border-b border-[#E5E5E5] bg-white">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl font-medium text-[#121212]">Add Team Member</DialogTitle>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsCSVMode(false)}
                                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${!isCSVMode ? 'bg-[#2DD4BF]/20 text-[#2DD4BF] border border-[#2DD4BF]/40' : 'text-[#78716C] hover:bg-[#F5F5F4]'}`}
                            >
                                Single Member
                            </button>
                            <button
                                onClick={() => setIsCSVMode(true)}
                                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${isCSVMode ? 'bg-[#2DD4BF]/20 text-[#2DD4BF] border border-[#2DD4BF]/40' : 'text-[#78716C] hover:bg-[#F5F5F4]'}`}
                            >
                                Bulk Import (CSV / Excel)
                            </button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="p-8 grid grid-cols-2 gap-8">
                    {isCSVMode ? (
                        <div className="col-span-2 space-y-4">
                            <div className="bg-[#2DD4BF]/5 border border-[#2DD4BF]/20 rounded-lg p-4">
                                <div className="text-sm font-medium text-[#292524] mb-2">CSV Format</div>
                                <div className="text-xs text-[#78716C] font-mono bg-white p-2 rounded border border-[#E5E5E5]">
                                    name,email,role,skills,utilization
                                </div>
                            </div>

                            <div className="flex gap-3 border-b border-[#E5E5E5]">
                                <button
                                    onClick={() => setCSVInputMode('upload')}
                                    className={`px-4 py-2 text-xs font-medium transition-all border-b-2 ${csvInputMode === 'upload' ? 'text-[#2DD4BF] border-[#2DD4BF]' : 'text-[#78716C] border-transparent hover:text-[#57534E]'}`}
                                >
                                    Upload File
                                </button>
                                <button
                                    onClick={() => setCSVInputMode('paste')}
                                    className={`px-4 py-2 text-xs font-medium transition-all border-b-2 ${csvInputMode === 'paste' ? 'text-[#2DD4BF] border-[#2DD4BF]' : 'text-[#78716C] border-transparent hover:text-[#57534E]'}`}
                                >
                                    Paste Data
                                </button>
                            </div>

                            {csvInputMode === 'upload' ? (
                                <div className="space-y-3">
                                    <div 
                                        className={`border-2 border-dashed ${isDragging ? 'border-[#2DD4BF] bg-[#2DD4BF]/5' : 'border-[#2DD4BF]/30 hover:border-[#2DD4BF]/50 hover:bg-[#2DD4BF]/3'} rounded-lg p-8 text-center transition-all`}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={handleDrop}
                                    >
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleCSVFileUpload}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isSubmitting}
                                            className="inline-flex flex-col items-center gap-2 cursor-pointer"
                                        >
                                            <div className="text-3xl">📁</div>
                                            <div className="text-sm font-medium text-[#292524]">Click to upload CSV / Excel file</div>
                                            <div className="text-xs text-[#78716C]">or drag and drop</div>
                                        </button>
                                    </div>
                                    {csvData && (
                                        <div className="p-3 bg-[#7C9A82]/10 border border-[#7C9A82]/20 rounded-lg">
                                            <div className="text-xs font-medium text-[#7C9A82] mb-1">✓ File loaded</div>
                                            <div className="text-xs text-[#57534E] font-mono">{csvData.split('\n').length - 1} rows ready to import</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <Label className="text-xs font-medium text-[#737373] uppercase tracking-wide">Paste CSV Data</Label>
                                    <textarea
                                        value={csvData}
                                        onChange={(e) => setCSVData(e.target.value)}
                                        className="w-full h-40 p-3 border-[#E5E5E5] bg-white rounded-lg border font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#2DD4BF]/20 focus:border-[#2DD4BF]"
                                        placeholder="name,email,role,skills,utilization&#10;John Doe,john@example.com,Frontend Developer,React TypeScript,85&#10;Jane Smith,jane@example.com,Backend Developer,Node.js PostgreSQL,90"
                                        disabled={isSubmitting}
                                    />
                                </div>
                            )}

                            <button
                                onClick={downloadSampleCSV}
                                className="text-xs font-medium text-[#2DD4BF] hover:text-[#2DD4BF]/80 transition-colors"
                            >
                                ↓ Download Sample CSV
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-[#737373] uppercase tracking-wide">Full Name</Label>
                            <Input value={name} onChange={(e) => { setName(e.target.value); if (memberAttempted) setMemberErrors(prev => ({ ...prev, name: validators.required(e.target.value, 'Full name') })); }} className={`h-10 bg-white ${memberErrors.name ? 'border-[#BE123C]' : 'border-[#E5E5E5]'}`} placeholder="e.g. Jane Doe" />
                            <FormError message={memberErrors.name} />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-[#737373] uppercase tracking-wide">Email</Label>
                            <Input value={email} onChange={(e) => { setEmail(e.target.value); if (memberAttempted) setMemberErrors(prev => ({ ...prev, email: validators.email(e.target.value) })); }} className={`h-10 bg-white ${memberErrors.email ? 'border-[#BE123C]' : 'border-[#E5E5E5]'}`} placeholder="jane@example.com" />
                            <FormError message={memberErrors.email} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-[#737373] uppercase tracking-wide">Role</Label>
                            {!isCustomRole ? (
                                <div className="space-y-3">
                                    <Select value={role} onValueChange={(val) => { 
                                        setRole(val); 
                                        setMemberErrors(prev => ({ ...prev, role: '' }));
                                        // Auto-populate skills
                                        const suggestedSkills = roleService.getSkillsForRole(val);
                                        if (suggestedSkills.length > 0) setSkills(suggestedSkills.join(', '));
                                    }} disabled={isSubmitting}>
                                        <SelectTrigger className="h-10 border-[#E5E5E5] bg-white hover:border-[#D6D3D1] focus:ring-2 focus:ring-[#2DD4BF]/20 focus:border-[#2DD4BF] transition-all duration-200">
                                            <SelectValue placeholder="Select a role" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-[#E5E5E5] shadow-lg max-h-[300px]">
                                            {roleService.getRoles().map(_role => (
                                                <SelectItem key={_role} value={_role} className="hover:bg-[#FAFAF9] focus:bg-[#FAFAF9] capitalize">{_role}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <button
                                        onClick={() => { setIsCustomRole(true); setRole(''); setMemberErrors(prev => ({ ...prev, role: '' })); }}
                                        disabled={isSubmitting}
                                        className="w-full py-2.5 px-3 text-xs font-medium text-[#2DD4BF] border border-[#2DD4BF]/30 bg-[#2DD4BF]/5 rounded-lg hover:bg-[#2DD4BF]/10 hover:border-[#2DD4BF]/60 transition-all duration-200 disabled:opacity-50"
                                    >
                                        + Add Custom Role
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <Input 
                                        value={customRole} 
                                        onChange={(e) => { setCustomRole(e.target.value); setMemberErrors(prev => ({ ...prev, role: '' })); }} 
                                        className="h-10 border-[#E5E5E5] bg-white hover:border-[#D6D3D1] focus:ring-2 focus:ring-[#2DD4BF]/20 focus:border-[#2DD4BF] transition-all duration-200" 
                                        placeholder="e.g. DevOps Engineer" 
                                        disabled={isSubmitting}
                                    />
                                    <button
                                        onClick={() => { setIsCustomRole(false); setCustomRole(''); setMemberErrors(prev => ({ ...prev, role: '' })); }}
                                        disabled={isSubmitting}
                                        className="w-full py-2.5 px-3 text-xs font-medium text-[#737373] border border-[#E5E5E5] bg-white rounded-lg hover:bg-[#FAFAF9] hover:border-[#D6D3D1] transition-all duration-200 disabled:opacity-50"
                                    >
                                        Select from List
                                    </button>
                                </div>
                            )}
                            <FormError message={memberErrors.role} />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-[#737373] uppercase tracking-wide">Skills (comma separated)</Label>
                            <Input value={skills} onChange={(e) => setSkills(e.target.value)} className="h-10 border-[#E5E5E5] bg-white" placeholder="React, Node.js, etc." />
                        </div>
                    </div>

                    <div className="col-span-2 space-y-2">
                        <div className="flex justify-between">
                            <Label className="text-xs font-medium text-[#737373] uppercase tracking-wide">Target Utilization</Label>
                            <span className="text-xs font-medium text-[#121212]">{utilization}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="120"
                            value={utilization}
                            onChange={(e) => setUtilization(parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-black"
                        />
                    </div>
                        </>
                    )}
                </div>

                <DialogFooter className="px-8 py-5 border-t border-[#E5E5E5] bg-white flex justify-end gap-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting} className="border-[#E5E5E5] text-[#737373] hover:text-[#121212]">Cancel</Button>
                    {isCSVMode ? (
                        <LoadingButton onClick={handleCSVImport} isLoading={isSubmitting} disabled={isSubmitting || !csvData.trim()} className="bg-[#2DD4BF] text-[#121212] hover:bg-[#2DD4BF]/90 shadow-sm px-6">Import Members</LoadingButton>
                    ) : (
                        <LoadingButton onClick={handleAddMember} isLoading={isSubmitting} disabled={isSubmitting} className="bg-[#121212] text-white hover:bg-[#262626] shadow-sm px-6">Add Member</LoadingButton>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const PeopleCapacityScreen = () => {
    const { user, orgId, orgRole, activeTeamId } = useAuth();
    const [selectedPerson, setSelectedPerson] = useState<TeamMemberView | null>(null);
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [voiceMemberData, setVoiceMemberData] = useState<{ name?: string; email?: string; role?: string } | null>(null);


    const [teamMembers, setTeamMembers] = useState<TeamMemberView[]>([]);
    const [pendingSkills, setPendingSkills] = useState<PendingSkillView[]>([]);
    const [allPersonDetails, setAllPersonDetails] = useState<Record<string, PersonDetailView>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isEditingSkills, setIsEditingSkills] = useState(false);
    const [editedSkills, setEditedSkills] = useState<{ name: string; proficiency: number }[]>([]);
    const [newSkillName, setNewSkillName] = useState('');
    const [newSkillProficiency, setNewSkillProficiency] = useState(65);
    const [currentTeamId, setCurrentTeamId] = useState<string>('');
    const [currentTeamName, setCurrentTeamName] = useState<string>('');
    const [currentTeamInviteCode, setCurrentTeamInviteCode] = useState<string>('');
    const [showSkillsVerification, setShowSkillsVerification] = useState(false);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
    const [pendingVoiceDelete, setPendingVoiceDelete] = useState<string | null>(null);
    const { consumeAction } = useVoice();
    
    const detailPanelRef = useRef<HTMLDivElement>(null);

    const handleRemoveMember = async (e: React.MouseEvent | null, memberId: string, memberName: string) => {
        if (e) e.stopPropagation();
        
        if (!confirm(`Are you sure you want to remove ${memberName} from the team? This action cannot be undone.`)) {
            return;
        }

        setRemovingMemberId(memberId);
        try {
            const orgId = getCurrentOrgId();
            if (!orgId) {
                toast.error('Organization not found');
                return;
            }

            // First, clean up any task assignments for this user
            const { error: taskError } = await supabase
                .from('task_assignments')
                .delete()
                .eq('user_id', memberId);

            if (taskError) {
                console.warn('Warning cleaning up task assignments:', taskError);
                // Continue with member deletion even if this fails
            }

            // Call RPC function to soft delete user (bypasses RLS Infinite Recursion)
            const { error: rpcError } = await supabase.rpc('soft_delete_user', { 
                target_user_id: memberId 
            });

            if (rpcError) {
                toast.error('Failed to update user status');
                console.error('RPC error:', rpcError);
                return;
            }

            console.log('[PeopleCapacity] User soft deleted successfully via RPC');

            // Update local state
            setTeamMembers(prevMembers => prevMembers.filter(m => m.id !== memberId));
            
            // Close detail panel if the removed member is selected
            if (selectedPerson?.id === memberId) {
                setSelectedPerson(null);
            }

            toast.success(`${memberName} has been permanently removed from the team`);
        } catch (error) {
            toast.error('An error occurred while removing the team member');
            console.error('Error removing member:', error);
        } finally {
            setRemovingMemberId(null);
        }
    };

    // Listen for voice command events
    useEffect(() => {
        // 1. Consume "Add Member" action from centralized queue
        const addAction = consumeAction('add_team_member');
        if (addAction) {
            console.log('[PeopleCapacityScreen] Consumed add_team_member action:', addAction);
            setVoiceMemberData(addAction.params || null);
            setIsAddMemberOpen(true);
        }

        // 2. Consume "Delete Member" action from centralized queue
        const deleteAction = consumeAction('delete_team_member');
        if (deleteAction && deleteAction.params?.name) {
            console.log('[PeopleCapacityScreen] Consumed delete_team_member action:', deleteAction);
            setPendingVoiceDelete(deleteAction.params.name);
        }

        // Support for real-time events if the user is already on the page
        const handleVoiceAddMember = (e: any) => {
            const data = e.detail;
            setVoiceMemberData(data);
            setIsAddMemberOpen(true);
        };

        const handleVoiceDeleteMember = (e: any) => {
            const { name } = e.detail;
            setPendingVoiceDelete(name);
        };

        window.addEventListener('velo-add-member', handleVoiceAddMember);
        window.addEventListener('velo-delete-member', handleVoiceDeleteMember);
        return () => {
            window.removeEventListener('velo-add-member', handleVoiceAddMember);
            window.removeEventListener('velo-delete-member', handleVoiceDeleteMember);
        };
    }, [consumeAction]);

    // Effect to trigger deletion once teamMembers are loaded
    useEffect(() => {
        if (pendingVoiceDelete && teamMembers.length > 0) {
            // Clean the name from any trailing punctuation that might have survived
            const name = pendingVoiceDelete.replace(/[.,!?;:]+$/, '').trim();
            console.log(`[PeopleCapacityScreen] Attempting voice delete for: "${name}"`);
            
            const member = findBestMatch(name, teamMembers, (m) => m.name);

            if (member) {
                console.log(`[PeopleCapacityScreen] Found member for voice delete: ${member.name} (${member.id})`);
                handleRemoveMember(null, member.id, member.name);
            } else {
                console.warn(`[PeopleCapacityScreen] Voice delete failed. Could not find match for "${name}" in:`, teamMembers.map(m => m.name));
                toast.error(`Could not find team member named "${name}"`);
            }
            setPendingVoiceDelete(null);
        }
    }, [pendingVoiceDelete, teamMembers, handleRemoveMember]);

    // Fetch assigned projects for team members
    const fetchMemberProjects = async (members: TeamMemberView[]) => {
        try {
            const membersWithProjects = await Promise.all(
                members.map(async (member) => {
                    try {
                        // Try to fetch tasks using assignee_id first
                        let { data: tasks, error } = await supabase
                            .from('tasks')
                            .select('project_id')
                            .eq('assignee_id', member.id)
                            .in('status', ['not_started', 'in_progress', 'blocked']);

                        // If no results with assignee_id, try user_id
                        if (error || !tasks || tasks.length === 0) {
                            console.log(`[fetchMemberProjects] Trying user_id for ${member.name}`);
                            const { data: userTasks, error: userError } = await supabase
                                .from('tasks')
                                .select('project_id')
                                .eq('user_id', member.id)
                                .in('status', ['not_started', 'in_progress', 'blocked']);

                            if (userError) {
                                console.warn(`Error fetching tasks for ${member.name}:`, userError);
                                return { ...member, assignedProjects: [] };
                            }
                            tasks = userTasks;
                        }

                        if (error || !tasks) {
                            console.warn(`Error fetching tasks for ${member.name}:`, error);
                            return { ...member, assignedProjects: [] };
                        }

                        console.log(`[fetchMemberProjects] Tasks for ${member.name} (${member.id}):`, tasks);

                        // Get unique project IDs
                        const projectIds = [...new Set(tasks.map(t => t.project_id).filter(id => id))];

                        if (projectIds.length === 0) {
                            console.log(`[fetchMemberProjects] No project IDs for ${member.name}`);
                            return { ...member, assignedProjects: [] };
                        }

                        // Fetch project details
                        const { data: projects, error: projectError } = await supabase
                            .from('projects')
                            .select('id, name')
                            .in('id', projectIds);

                        if (projectError || !projects) {
                            console.warn(`Error fetching projects for ${member.name}:`, projectError);
                            return { ...member, assignedProjects: [] };
                        }

                        console.log(`[fetchMemberProjects] Projects for ${member.name}:`, projects);

                        return {
                            ...member,
                            assignedProjects: projects.map(p => ({ id: p.id, name: p.name }))
                        };
                    } catch (error) {
                        console.error(`Error processing projects for ${member.name}:`, error);
                        return { ...member, assignedProjects: [] };
                    }
                })
            );

            console.log('[fetchMemberProjects] Final result:', membersWithProjects);
            return membersWithProjects;
        } catch (error) {
            console.error('Error in fetchMemberProjects:', error);
            return members;
        }
    };

    const loadTeamData = useCallback(async () => {
        if (!orgId || !user || document.hidden) return; 

        try {
            // Use activeTeamId as the target team context
            const targetTeamId = activeTeamId;
            const teamIds = targetTeamId ? [targetTeamId] : undefined;

            // Fetch team record for empty state invite banner
            let teamQuery = supabase
                .from('teams')
                .select('id, name, invite_code')
                .eq('organization_id', orgId);
            
            if (activeTeamId) {
                teamQuery = teamQuery.eq('id', activeTeamId);
            } else {
                teamQuery = teamQuery.order('created_at', { ascending: true }).limit(1);
            }

            const { data: teamRecord } = await teamQuery.maybeSingle();

            if (teamRecord) {
                setCurrentTeamId(teamRecord.id);
                setCurrentTeamName(teamRecord.name || '');
                setCurrentTeamInviteCode(teamRecord.invite_code || '');
            } else {
                // Clear team info if no team found for activeTeamId
                setCurrentTeamId('');
                setCurrentTeamName('');
                setCurrentTeamInviteCode('');
            }

            const [members, skills] = await Promise.all([
                peopleService.fetchAllTeamMembers(orgId, teamIds),
                peopleService.fetchPendingSkills(orgId, teamIds)
            ]);

            // Exclude current user (manager) from the list
            const filteredMembers = members.filter(m => m.id !== user.id);
            const filteredSkills = skills.filter(s => s.userId !== user.id);

            // Fetch assigned projects for each member
            const membersWithProjects = await fetchMemberProjects(filteredMembers);

            console.log('[loadTeamData] Members with projects:', membersWithProjects);

            setTeamMembers(membersWithProjects);
            setPendingSkills(filteredSkills);
        } catch (error) {
            console.error('Error loading team data:', error);
            toast.error('Failed to load team members data.');
            // No fallback - use only dynamic data
        } finally {
            setIsLoading(false);
        }
    }, [orgId, user, activeTeamId]);

    useEffect(() => {
        loadTeamData();
    }, [loadTeamData]);

    // Fetch dynamic capacity timeline from tasks
    const fetchCapacityTimeline = async (userId: string) => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Calculate dates for 4 weeks
            const weeks = [];
            for (let i = 0; i < 4; i++) {
                const weekStart = new Date(today);
                weekStart.setDate(weekStart.getDate() + i * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                weeks.push({ start: weekStart, end: weekEnd });
            }

            // Fetch tasks for the user for the next 4 weeks
            const { data: tasks, error } = await supabase
                .from('tasks')
                .select('estimated_hours, start_date, due_date')
                .eq('assignee_id', userId)
                .or(`status.eq.not_started,status.eq.in_progress`)
                .gte('due_date', today.toISOString().split('T')[0]);

            if (error) {
                console.error('Error fetching tasks:', error);
                return [];
            }

            // Map tasks to weeks and calculate hours
            const capacityTimeline = weeks.map((week, idx) => {
                const weekTasks = tasks.filter((task: any) => {
                    if (!task.due_date) return false;
                    const dueDate = new Date(task.due_date);
                    dueDate.setHours(0, 0, 0, 0);
                    return dueDate >= week.start && dueDate <= week.end;
                });

                const allocatedHours = weekTasks.reduce((sum: number, task: any) => {
                    return sum + (task.estimated_hours || 0);
                }, 0);

                const weekLabel = `${week.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${week.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                const availableHours = 40; // 40 hours per week (8 hours/day * 5 days)

                return {
                    week: weekLabel,
                    allocated: Math.round(allocatedHours),
                    available: availableHours
                };
            });

            return capacityTimeline;
        } catch (error) {
            console.error('Error in fetchCapacityTimeline:', error);
            return [];
        }
    };

    const fetchDetail = async (name: string, userId?: string) => {
        if (allPersonDetails[name]) return;
        try {
            // Use userId if available (more reliable than name matching)
            const detail = await peopleService.fetchPersonDetails(userId || name);
            
            // Fetch dynamic capacity timeline if userId is provided
            if (userId) {
                const capacityTimeline = await fetchCapacityTimeline(userId);
                detail.capacityTimeline = capacityTimeline;
            }
            
            setAllPersonDetails(prev => ({ ...prev, [name]: detail }));
        } catch (error) {
            console.error('Error fetching detail:', error);
            toast.error('Failed to load person details.');
            // No fallback - use only dynamic data
        }
    };

    useEffect(() => {
        if (selectedPerson) {
            fetchDetail(selectedPerson.name, selectedPerson.id);
        }
    }, [selectedPerson]);

    // Smooth scroll-to-top when detail panel opens
    useEffect(() => {
        if (selectedPerson && detailPanelRef.current) {
            setTimeout(() => {
                detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
        }
    }, [selectedPerson]);

    const [pendingSkillActions, setPendingSkillActions] = useState<Record<number, string>>({});

    // Default person details structure to prevent undefined errors
    const defaultPersonDetails = {
        capacityTimeline: [],
        projects: [],
        skills: [],
        recommendations: []
    };

    const personDetails = selectedPerson ? {
        name: selectedPerson.name,
        role: selectedPerson.role,
        avatar: selectedPerson.avatar,
        utilization: selectedPerson.utilization,
        ...defaultPersonDetails,
        ...(allPersonDetails[selectedPerson.name] || allPersonDetails[Object.keys(allPersonDetails)[0]] || {}),
        // Use assignedProjects from selectedPerson if available
        projects: (selectedPerson as any).assignedProjects && (selectedPerson as any).assignedProjects.length > 0
            ? (selectedPerson as any).assignedProjects.map((p: any) => ({ name: p.name, hours: 0 }))
            : (allPersonDetails[selectedPerson.name]?.projects || []),
    } : null;

    const handleEditSkills = () => {
        if (personDetails) {
            setEditedSkills([...personDetails.skills]);
            setIsEditingSkills(true);
        }
    };

    const handleSaveSkills = async () => {
        if (!selectedPerson) return;

        try {
            await peopleService.updateUserSkills(selectedPerson.id, editedSkills);
            toast.success('Skills updated successfully');
            
            // Update local state for the detail panel
            setAllPersonDetails(prev => ({
                ...prev,
                [selectedPerson.name]: {
                    ...prev[selectedPerson.name],
                    skills: editedSkills
                }
            }));

            // Update local state for the team list cards
            setTeamMembers(prev => prev.map(m => 
                m.id === selectedPerson.id 
                    ? { ...m, skills: editedSkills.map(s => s.name) } 
                    : m
            ));

            setIsEditingSkills(false);
        } catch (error) {
            toast.error('Failed to update skills');
            console.error(error);
        }
    };

    const handleAddSkill = () => {
        if (!newSkillName.trim()) return;
        if (editedSkills.some(s => s.name.toLowerCase() === newSkillName.trim().toLowerCase())) {
            toast.error('Skill already exists');
            return;
        }
        setEditedSkills([...editedSkills, { name: newSkillName.trim(), proficiency: newSkillProficiency }]);
        setNewSkillName('');
        setNewSkillProficiency(65);
    };

    const handleRemoveSkill = (index: number) => {
        setEditedSkills(editedSkills.filter((_, i) => i !== index));
    };

    const handleUpdateSkillProficiency = (index: number, proficiency: number) => {
        const updated = [...editedSkills];
        updated[index].proficiency = proficiency;
        setEditedSkills(updated);
    };

    const totalMembers = teamMembers.length;
    const avgUtilization = totalMembers > 0
        ? Math.round(teamMembers.reduce((acc, m) => acc + m.utilization, 0) / totalMembers)
        : 0;
    const overloadedCount = teamMembers.filter(m => m.status === 'overloaded').length;
    const totalAvailableCapacity = teamMembers.reduce((acc, m) => acc + m.availability, 0);

    if (isLoading) return <PageSkeleton />;

    return (
        <div className="p-12 relative min-h-screen bg-[#FAFAF9]">
            <div
                className="absolute top-0 left-1/2 transform -translate-x-1/2 pointer-events-none"
                style={{
                    width: '800px',
                    height: '400px',
                    background: 'radial-gradient(circle, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0) 70%)',
                    filter: 'blur(120px)',
                    opacity: 0.4,
                }}
            />

            <div className="max-w-[1600px] mx-auto relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-light text-[#1C1917] tracking-tight">People & Capacity</h1>
                    <Button
                        className="bg-[#1C1917] hover:bg-[#292524] h-11 px-6 rounded-xl font-light transition-all duration-300 text-white shadow-md"
                        onClick={() => setIsAddMemberOpen(true)}
                    >
                        <AddOutlined style={{ fontSize: 16 }} className="mr-2" />
                        Add Team Member
                    </Button>
                </div>

                <AddTeamMemberModal 
                    open={isAddMemberOpen} 
                    onOpenChange={(open) => {
                        setIsAddMemberOpen(open);
                        if (!open) setVoiceMemberData(null); // Clear on close
                    }} 
                    onMemberAdded={() => { loadTeamData(); if (orgId) setupProgressService.markStepComplete(orgId, 'team_members_added'); }} 
                    initialData={voiceMemberData}
                    activeTeamId={activeTeamId}
                />

                {/* Capacity Summary Strip */}
                <div className="flex items-center gap-0 mb-10">
                    <div className="flex-1 py-8">
                        <div className="text-4xl font-light text-[#1C1917] mb-2">{totalMembers}</div>
                        <div className="text-sm text-[#78716C] font-light">Total Members</div>
                    </div>
                    <div className="w-px h-16 bg-[#E7E5E4]"></div>
                    <div className="flex-1 py-8 px-8">
                        <div className="text-4xl font-light text-[#1C1917] mb-2">{avgUtilization}%</div>
                        <div className="text-sm text-[#78716C] font-light">Avg Utilization</div>
                    </div>
                    <div className="w-px h-16 bg-[#E7E5E4]"></div>
                    <div className="flex-1 py-8 px-8">
                        <div className="text-4xl font-light text-[#1C1917] mb-2">{overloadedCount}</div>
                        <div className="text-sm text-[#78716C] font-light">Overloaded Count</div>
                    </div>
                    <div className="w-px h-16 bg-[#E7E5E4]"></div>
                    <div className="flex-1 py-8 pl-8">
                        <div className="text-4xl font-light text-[#1C1917] mb-2">{totalAvailableCapacity}h</div>
                        <div className="text-sm text-[#78716C] font-light">Available Capacity</div>
                    </div>
                </div>

                {/* Skills Verification Banner */}
                {pendingSkills.length > 0 && !showSkillsVerification && (
                    <div className="mb-8 flex items-center justify-between p-5 bg-white border border-[#E7E5E4] rounded-xl shadow-sm animate-in fade-in duration-300">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                                <NotificationsActiveOutlined style={{ fontSize: 20 }} className="text-amber-600" />
                            </div>
                            <div>
                                <div className="text-sm text-[#1C1917] font-medium">{pendingSkills.length} skills pending verification</div>
                                <div className="text-xs text-[#78716C] font-light">Team members have updated their skills profiles — review and verify proficiency levels.</div>
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowSkillsVerification(true)}
                            className="bg-[#1C1917] hover:bg-[#292524] h-9 px-5 rounded-xl font-light text-white shadow-sm transition-all"
                        >
                            Review Skills
                            <ArrowForwardOutlined style={{ fontSize: 14 }} className="ml-2" />
                        </Button>
                    </div>
                )}

                {/* Skills Verification Panel */}
                {showSkillsVerification && (
                    <div className="mb-8 bg-white/70 backdrop-blur-[32px] border-[0.5px] border-white/20 rounded-2xl shadow-sm animate-in fade-in duration-300 overflow-hidden">
                        <div className="px-8 py-5 border-b border-[#E7E5E4] bg-[#FAFAF9] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <VerifiedOutlined style={{ fontSize: 20 }} className="text-[#0F766E]" />
                                <div>
                                    <h2 className="text-lg font-light text-[#1C1917]">Skills Verification</h2>
                                    <p className="text-xs text-[#78716C] font-light">{pendingSkills.length} pending · Confirm, adjust, or remove reported skills</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSkillsVerification(false)} className="text-[#A8A29E] hover:text-[#78716C] transition-colors">
                                <CloseOutlined style={{ fontSize: 20 }} />
                            </button>
                        </div>
                        <div className="divide-y divide-[#E7E5E4]/50">
                            {pendingSkills.map((item) => {
                                const action = pendingSkillActions[item.id];
                                return (
                                    <div key={item.id} className={`px-8 py-5 flex items-center gap-6 transition-all duration-300 ${action ? 'opacity-50 bg-[#FAFAF9]' : 'hover:bg-[#FAFAF9]/50'}`}>
                                        <div className="flex items-center gap-3 w-48">
                                            <Avatar className="w-9 h-9 border border-white/20 shadow-sm">
                                                <AvatarFallback className="bg-[#F5F5F4] text-[#1C1917] text-xs font-light">{item.avatar}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-sm text-[#1C1917] font-light">{item.person}</div>
                                                <div className="text-[10px] text-[#78716C] font-light">
                                                    {item.suggestedBy === 'ai' ? 'AI detected' : 'Self-reported'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-1 flex items-center gap-6">
                                            <div className="w-40">
                                                <div className="text-xs text-[#78716C] font-light mb-0.5">Skill</div>
                                                <div className="text-sm text-[#1C1917] font-light flex items-center gap-2">
                                                    {item.skill}
                                                    {item.suggestedBy === 'ai' && (
                                                        <span className="px-1.5 py-0.5 bg-[#F0FDFA] text-[#0F766E] text-[9px] rounded font-medium uppercase tracking-wide">AI</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="w-28">
                                                <div className="text-xs text-[#78716C] font-light mb-0.5">Self-Rated</div>
                                                <div className="text-sm text-[#1C1917] font-light">{item.selfRated}</div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-xs text-[#78716C] font-light mb-0.5">Evidence</div>
                                                <div className="text-xs text-[#78716C] font-light">{item.evidence}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 w-72 justify-end">
                                            {action ? (
                                                <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${action === 'confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                                    action === 'adjusted' ? 'bg-amber-50 text-amber-700' :
                                                        'bg-rose-50 text-rose-700'
                                                    }`}>
                                                    {action === 'confirmed' ? 'Confirmed' : action === 'adjusted' ? 'Adjusted to Mid' : 'Removed'}
                                                </span>
                                            ) : (
                                                <div className="contents">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => setPendingSkillActions(prev => ({ ...prev, [item.id]: 'confirmed' }))}
                                                        className="bg-[#1C1917] hover:bg-[#292524] h-8 px-4 rounded-lg font-light text-white text-xs shadow-sm"
                                                    >
                                                        <CheckCircleOutlined style={{ fontSize: 14 }} className="mr-1.5" />
                                                        Confirm
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setPendingSkillActions(prev => ({ ...prev, [item.id]: 'adjusted' }))}
                                                        className="h-8 px-3 border-[#E7E5E4] text-[#78716C] hover:text-[#1C1917] hover:bg-white rounded-lg font-light text-xs"
                                                    >
                                                        <TuneOutlined style={{ fontSize: 14 }} className="mr-1.5" />
                                                        Adjust
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setPendingSkillActions(prev => ({ ...prev, [item.id]: 'removed' }))}
                                                        className="h-8 px-3 border-rose-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg font-light text-xs"
                                                    >
                                                        <DeleteOutlined style={{ fontSize: 14 }} />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {Object.keys(pendingSkillActions).length === pendingSkills.length && (
                            <div className="px-8 py-4 border-t border-[#E7E5E4] bg-[#FAFAF9] flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-[#0F766E] font-light">
                                    <CheckCircleOutlined style={{ fontSize: 14 }} />
                                    All skills reviewed
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => setShowSkillsVerification(false)}
                                    className="bg-[#1C1917] hover:bg-[#292524] h-9 px-5 rounded-xl font-light text-white shadow-sm"
                                >
                                    Done
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Expanded Person Detail */}
                {selectedPerson && personDetails && (
                    <div ref={detailPanelRef} className="mb-6 bg-white border border-[#E7E5E4] rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden animate-in slide-in-from-top-4 fade-in duration-300">
                        {/* Detail Header */}
                        <div className="px-8 pt-8 pb-0">
                            <div className="flex items-start justify-between mb-8">
                                <div className="flex items-center gap-5">
                                    <Avatar className="w-16 h-16 border-2 border-[#2DD4BF]/25 shadow-md">
                                        <AvatarFallback className="bg-[#2DD4BF]/[0.08] text-[#1C1917] text-xl font-light">
                                            {personDetails.avatar}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-xl font-light text-[#1C1917] mb-1">{personDetails.name}</div>
                                        <div className="text-sm text-[#57534E] font-light">{personDetails.role}</div>
                                    </div>
                                    <div className={`ml-2 px-3 py-1 rounded-full text-xs font-light ${personDetails.utilization > 110
                                        ? 'bg-[#C2714F]/10 text-[#C2714F] border border-[#C2714F]/20'
                                        : personDetails.utilization > 90
                                            ? 'bg-[#C2714F]/[0.06] text-[#C2714F]/80 border border-[#C2714F]/12'
                                            : 'bg-[#7C9A82]/10 text-[#7C9A82] border border-[#7C9A82]/20'
                                        }`}>
                                        {personDetails.utilization > 110 ? 'Overloaded' : personDetails.utilization > 90 ? 'At Capacity' : 'Healthy'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedPerson(null)}
                                    className="text-[#A8A29E] hover:text-[#57534E] transition-colors p-1"
                                >
                                    <CloseOutlined style={{ fontSize: 20 }} />
                                </button>
                            </div>
                        </div>

                        {/* Detail Content - 3 Column Grid */}
                        <div className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Left: Utilization & Timeline */}
                            <div className="space-y-6">
                                <div>
                                    <div className="text-xs text-[#78716C] font-light uppercase tracking-wider mb-3">Current Utilization</div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className="flex-1">
                                            <UtilizationBar value={personDetails.utilization} />
                                        </div>
                                        <span className={`text-sm font-light ${personDetails.utilization > 100 ? 'text-[#C2714F]/80' :
                                            personDetails.utilization > 85 ? 'text-[#57534E]' :
                                                'text-[#7C9A82]/80'
                                            }`}>{personDetails.utilization}%</span>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-[#78716C] font-light uppercase tracking-wider mb-3">Capacity Timeline (4 Weeks)</div>
                                    <div className="space-y-3">
                                        {personDetails.capacityTimeline.map((week, idx) => (
                                            <div key={idx}>
                                                <div className="flex justify-between text-xs text-[#78716C] font-light mb-1.5">
                                                    <span>{week.week}</span>
                                                    <span>{week.allocated}h / {week.available}h</span>
                                                </div>
                                                <div className="w-full bg-[#F5F5F4] rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 rounded-full ${week.allocated > week.available ? 'bg-[#C2714F]/50' : 'bg-[#2DD4BF]/40'
                                                            }`}
                                                        style={{ width: `${Math.min((week.allocated / week.available) * 100, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Middle: Projects & Skills */}
                            <div className="space-y-6">
                                <div>
                                    <div className="text-xs text-[#78716C] font-light uppercase tracking-wider mb-3">Assigned Projects</div>
                                    <div className="space-y-2">
                                        {personDetails.projects.map((project, idx) => (
                                            <div key={idx} className="flex items-center justify-between py-3 px-4 bg-[#2DD4BF]/[0.04] border border-[#2DD4BF]/10 rounded-xl">
                                                <div className="text-sm text-[#292524] font-light">{project.name}</div>
                                                <div className="text-sm text-[#57534E] font-light">{project.hours}h/wk</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-xs text-[#78716C] font-light uppercase tracking-wider">Skills</div>
                                        {(orgRole === 'manager' || orgRole === 'admin') && !isEditingSkills && (
                                            <button 
                                                onClick={handleEditSkills}
                                                className="text-[10px] text-[#2DD4BF] hover:text-[#2DD4BF]/80 font-medium uppercase tracking-wider transition-colors"
                                            >
                                                Edit Skills
                                            </button>
                                        )}
                                    </div>

                                    {isEditingSkills ? (
                                        <div className="space-y-4 bg-[#F5F5F4]/30 p-4 rounded-xl border border-[#E7E5E4]/50">
                                            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                                {editedSkills.map((skill, idx) => (
                                                    <div key={idx} className="flex flex-col gap-2 p-2 bg-white rounded-lg border border-[#E7E5E4] shadow-sm">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-light text-[#1C1917]">{skill.name}</span>
                                                            <button onClick={() => handleRemoveSkill(idx)} className="text-[#A8A29E] hover:text-rose-500">
                                                                <DeleteOutlined style={{ fontSize: 14 }} />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <Select 
                                                                value={skill.proficiency.toString()} 
                                                                onValueChange={(val) => handleUpdateSkillProficiency(idx, parseInt(val))}
                                                            >
                                                                <SelectTrigger className="h-7 text-[10px] border-[#E7E5E4]">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="35">Beginner (35%)</SelectItem>
                                                                    <SelectItem value="65">Mid (65%)</SelectItem>
                                                                    <SelectItem value="90">Advanced (90%)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-3 border-t border-[#E7E5E4] space-y-3">
                                                <div className="flex gap-2">
                                                    <Input 
                                                        placeholder="New skill..." 
                                                        value={newSkillName}
                                                        onChange={(e) => setNewSkillName(e.target.value)}
                                                        className="h-8 text-xs"
                                                    />
                                                    <Button 
                                                        size="sm" 
                                                        onClick={handleAddSkill}
                                                        className="h-8 bg-[#1C1917] hover:bg-[#292524] text-white"
                                                    >
                                                        Add
                                                    </Button>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <Select 
                                                        value={newSkillProficiency.toString()} 
                                                        onValueChange={(val) => setNewSkillProficiency(parseInt(val))}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs border-[#E7E5E4] flex-1">
                                                            <SelectValue placeholder="Proficiency" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="35">Beginner (35%)</SelectItem>
                                                            <SelectItem value="65">Mid (65%)</SelectItem>
                                                            <SelectItem value="90">Advanced (90%)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 pt-2">
                                                <Button 
                                                    size="sm" 
                                                    onClick={handleSaveSkills}
                                                    className="flex-1 bg-[#2DD4BF] hover:bg-[#2DD4BF]/90 text-[#1C1917] text-xs h-9"
                                                >
                                                    Save Changes
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    onClick={() => setIsEditingSkills(false)}
                                                    className="flex-1 border-[#E7E5E4] text-[#78716C] text-xs h-9"
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {personDetails.skills.length > 0 ? personDetails.skills.map((skill, idx) => (
                                                <div key={idx}>
                                                    <div className="flex justify-between text-xs text-[#78716C] font-light mb-1.5">
                                                        <span>{skill.name}</span>
                                                        <span>{skill.proficiency}%</span>
                                                    </div>
                                                    <div className="w-full bg-[#F5F5F4] rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className="h-full bg-[#7C9A82]/40 transition-all duration-500 rounded-full"
                                                            style={{ width: `${skill.proficiency}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-xs text-[#A8A29E] font-light italic py-2">No skills listed</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: AI Recommendations */}
                            <div>
                                <AISuggestionPanel suggestions={personDetails.recommendations} title="AI Suggestions" compact />
                            </div>
                        </div>
                    </div>
                )}

                {/* Team Cards */}
                {teamMembers.length === 0 ? (
                    <PeopleEmptyState
                        teamName={currentTeamName}
                        inviteCode={currentTeamInviteCode}
                        teamId={currentTeamId}
                        organizationId={orgId || ''}
                        onMembersAdded={() => loadTeamData()}
                    />
                ) : (
                <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 transition-all duration-500 ease-out ${selectedPerson ? 'translate-y-0 opacity-100' : ''}`}>
                    {teamMembers.map((member, idx) => (
                        <div
                            key={idx}
                            onClick={() => setSelectedPerson(member)}
                            style={{ transitionDelay: selectedPerson ? `${idx * 30}ms` : '0ms' }}
                            className={`backdrop-blur-[32px] border rounded-2xl p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] cursor-pointer transition-all duration-300 group ${selectedPerson?.name === member.name
                                ? 'bg-white border-[#2DD4BF]/40 ring-1 ring-[#2DD4BF]/20 scale-[0.98]'
                                : selectedPerson
                                    ? 'bg-white border-[#E7E5E4] hover:border-[#2DD4BF]/25 hover:bg-white opacity-75 hover:opacity-100'
                                    : 'bg-white border-[#E7E5E4] hover:border-[#2DD4BF]/25 hover:bg-white'
                                }`}
                        >
                            {/* Top: Avatar, Name, Role, Status */}
                            <div className="flex items-start gap-4 mb-5">
                                <Avatar className="w-11 h-11 border border-[#2DD4BF]/20 shadow-sm">
                                    <AvatarFallback className="bg-[#2DD4BF]/[0.08] text-[#1C1917] text-sm font-light">{member.avatar}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm text-[#1C1917] font-light truncate">{member.name}</div>
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${member.status === 'overloaded' ? 'bg-[#C2714F]/70' :
                                            member.status === 'at-risk' ? 'bg-[#D4A017]/70' :
                                                'bg-[#7C9A82]/70'
                                            }`} />
                                    </div>
                                    <div className="text-xs text-[#57534E] font-light mt-0.5">{member.role}</div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={(e) => handleRemoveMember(e, member.id, member.name)}
                                        disabled={removingMemberId === member.id}
                                        className="p-1.5 text-[#D6D3D1] hover:text-[#C2714F] hover:bg-[#C2714F]/10 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Remove member"
                                    >
                                        <DeleteOutlined style={{ fontSize: 16 }} />
                                    </button>
                                    <ArrowForwardOutlined style={{ fontSize: 16 }} className="text-[#D6D3D1] group-hover:text-[#2DD4BF] transition-colors shrink-0 mt-1" />
                                </div>
                            </div>

                            {/* Utilization bar */}
                            <div className="mb-5">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] text-[#78716C] font-light uppercase tracking-wider">Utilization</span>
                                    <span className={`text-sm font-light ${member.utilization > 90 ? 'text-[#C2714F]/80' :
                                        member.utilization > 70 ? 'text-[#57534E]' :
                                            'text-[#7C9A82]/80'
                                        }`}>
                                        {member.utilization}%
                                    </span>
                                </div>
                                <UtilizationBar value={member.utilization} />
                            </div>

                            {/* Stats & Assigned Projects */}
                            <div className="mb-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="flex-1 bg-[#7C9A82]/[0.05] rounded-xl px-3 py-2.5 text-center border border-[#7C9A82]/10">
                                        <div className="text-sm text-[#1C1917] font-light">{(member as any).assignedProjects?.length || 0}</div>
                                        <div className="text-[10px] text-[#78716C] font-light mt-0.5">Projects</div>
                                    </div>
                                    <div className="flex-1 bg-[#7C9A82]/[0.05] rounded-xl px-3 py-2.5 text-center border border-[#7C9A82]/10">
                                        <div className="text-sm text-[#1C1917] font-light">{member.availability}h</div>
                                        <div className="text-[10px] text-[#78716C] font-light mt-0.5">Avail (2wk)</div>
                                    </div>
                                </div>

                                {/* Assigned Projects List */}
                                {(member as any).assignedProjects && (member as any).assignedProjects.length > 0 && (
                                    <div className="space-y-2 border-t border-[#E7E5E4] pt-3">
                                        <div className="text-[10px] text-[#78716C] font-light uppercase tracking-wider mb-2">Assigned To</div>
                                        <div className="flex flex-wrap gap-2">
                                            {(member as any).assignedProjects.map((project: any, i: number) => (
                                                <span key={i} className="px-2.5 py-1 bg-[#7C9A82]/[0.08] border border-[#7C9A82]/20 text-[#292524] text-[10px] rounded-full font-light truncate max-w-full">
                                                    {project.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {(!((member as any).assignedProjects) || (member as any).assignedProjects.length === 0) && (
                                    <div className="border-t border-[#E7E5E4] pt-3">
                                        <div className="text-[10px] text-[#78716C] font-light uppercase tracking-wider">Assigned To</div>
                                        <div className="text-[10px] text-[#A8A29E] font-light mt-1.5">No projects assigned</div>
                                    </div>
                                )}
                            </div>

                            {/* Skills */}
                            <div className="flex gap-1.5 flex-wrap mb-4">
                                {member.skills.slice(0, 3).map((skill, i) => (
                                    <span key={i} className="px-2.5 py-1 bg-[#2DD4BF]/[0.06] border border-[#2DD4BF]/12 text-[#292524] text-[11px] rounded-full font-light">
                                        {skill}
                                    </span>
                                ))}
                                {member.skills.length > 3 && (
                                    <span className="px-2.5 py-1 bg-[#FAFAF9] border border-[#E7E5E4] text-[#57534E] text-[11px] rounded-full font-light">
                                        +{member.skills.length - 3}
                                    </span>
                                )}
                            </div>

                            {/* Tasks with Dates */}
                            {member.tasks && member.tasks.length > 0 && (
                                <div className="space-y-2 border-t border-[#E7E5E4] pt-4">
                                    <div className="text-xs text-[#78716C] font-light uppercase tracking-wider mb-2">Assigned Tasks</div>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {member.tasks.map((task, i) => (
                                            <div key={i} className="p-2.5 bg-[#F5F5F4] border border-[#E7E5E4] rounded-lg">
                                                <div className="text-xs text-[#1C1917] font-light truncate mb-1">{task.name}</div>
                                                <div className="flex gap-2 text-[10px] text-[#78716C] font-light">
                                                    {task.start_date && (
                                                        <span className="px-1.5 py-0.5 bg-white border border-[#E7E5E4] rounded">
                                                            Start: {new Date(task.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    )}
                                                    {task.due_date && (
                                                        <span className="px-1.5 py-0.5 bg-white border border-[#E7E5E4] rounded">
                                                            Due: {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                )}
            </div>
        </div>
    );
};
