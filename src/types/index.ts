// ==================== SHARED TYPESCRIPT TYPES (v1 Schema Aligned) ====================

// ── Backend Data Model (Supabase) ──────────────────────────────

/** Organization entity — maps to `organizations` table */
export interface EditableTask {
    id: string;
    task: string;
    estimatedHours: number;
    requiredSkills: string[];
}

export interface Organization {
    id: string;
    name: string;
    slug: string;
    subscription_tier: string;
    status: string;
    work_hours_per_week: number;
    work_days_per_week: number;
    week_starts_on: string;
    fiscal_year_start: string;
    target_utilization: number;
    overload_threshold?: number;
    ai_low_confidence_threshold?: number;
    ai_health_score_warning?: number;
    ai_timeline_risk_days?: number;
}

/** Core user entity — maps to `users` table */
export interface User {
    id: string;
    organization_id: string;
    email: string;
    name: string;
    role: string;
    designation?: string;
    capacity_hours_per_week: number;
    is_active: boolean;
}

/** Team entity — maps to `teams` table */
export interface Team {
    id: string;
    organization_id: string;
    name: string;
}

/** Team ↔ User mapping — maps to `team_members` table */
export interface TeamMember {
    id: string;
    team_id: string;
    user_id: string;
    role: string;
}

/** User's membership in a specific team with a specific role */
export interface UserTeam {
    teamId: string;
    teamName: string;
    role: string;
}

/** Project entity — maps to `projects` table */
export interface Project {
    id: string;
    organization_id: string;
    team_id: string;
    name: string;
    source: 'internal' | 'jira';
    status: 'active' | 'completed';
}

/** Task entity — maps to `tasks` table */
export interface Task {
    id: string;
    project_id: string;
    jira_issue_id?: string;
    name: string;
    estimated_hours: number;
    actual_hours: number;
    status: string;
    start_date?: string;
    due_date?: string;
    user_id?: string;
}

/** Task ↔ User assignment — maps to `task_assignments` table */
export interface TaskAssignment {
    id: string;
    task_id: string;
    user_id: string;
    allocated_hours_per_week: number;
    start_date: string;
    end_date: string;
}

/** User skill — maps to `user_skills` table */
export interface UserSkill {
    id: string;
    user_id: string;
    skill_name: string;
    proficiency_level: 'beginner' | 'mid' | 'advanced';
    experience_years: number;
    source: 'manual' | 'llm' | 'project_derived';
    confidence_score: number;
}

/** Holiday — maps to `holidays` table */
export interface Holiday {
    id: string;
    organization_id: string;
    name: string;
    date: string;
}

/** Leave type — maps to `leave_types` table */
export interface LeaveType {
    id: string;
    organization_id: string;
    name: string;
    annual_quota: number;
}

/** Leave request — maps to `leave_requests` table */
export interface LeaveRequest {
    id: string;
    organization_id: string;
    user_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    status: 'approved' | 'pending';
    // Backwards compatibility for UI
    leave_type?: string;
}

/** Leave balance — maps to `employee_leave_balances` table */
export interface EmployeeLeaveBalance {
    id: string;
    organization_id: string;
    user_id: string;
    leave_type_id: string;
    year: number;
    total_allocated: number;
    used_days: number;
    pending_days: number;
}

// ── Planning Data Model (pre-execution) ────────────────────────

/** Project plan — maps to `project_plans` table */
export interface ProjectPlan {
    id: string;
    organization_id: string;
    created_by: string;
    title: string;
    status: 'draft' | 'published';
}

/** Plan task — maps to `plan_tasks` table (AI-generated decomposition) */
export interface PlanTask {
    id: string;
    plan_id: string;
    task_name: string;
    estimated_hours: number;
    required_skills: string[]; // JSONB in DB
}

/** Plan task match — maps to `plan_task_matches` table */
export interface PlanTaskMatch {
    id: string;
    plan_task_id: string;
    user_id: string;
    match_percentage: number;
    is_selected: boolean;
}

// ── Derived / View-model types (composed from backend data) ────

/** Legacy Plan Team Candidate — used in PlanMyProjectScreen UI */
export interface PlanTeamCandidate {
    id: string;
    plan_id: string;
    user_id: string;
    name: string;
    role: string;
    avatar: string;
    match_percentage: number;
    availability: number;
    task_fit: string[];
}

/** Team member card — derived from User + TaskAssignments */
export interface TeamMemberView {
    id: string;
    name: string;
    role: string;
    avatar: string;
    skills: string[];
    utilization: number;
    projects: number;
    status: 'healthy' | 'overloaded' | 'at-risk';
    availability: number;
    tasks?: Array<{
        id: string;
        name: string;
        start_date: string | null;
        due_date: string | null;
    }>;
}

/** Pending skill for verification */
export interface PendingSkillView {
    id: number;
    userId: string;
    person: string;
    avatar: string;
    skill: string;
    selfRated: string;
    evidence: string;
    suggestedBy: 'ai' | 'user';
}

/** Person detail view model */
export interface PersonDetailView {
    capacityTimeline: { week: string; allocated: number; available: number }[];
    projects: { name: string; hours: number }[];
    skills: { name: string; proficiency: number }[];
    recommendations: AISuggestion[];
}

/** AI Suggestion types */
export type SuggestionCategory = 'reallocation' | 'overload' | 'risk';

export interface AISuggestionImpact {
    summary: string;
    affectedMembers?: string[];
    affectedProjects?: string[];
    timelineEffect?: string;
    hoursImpact?: string;
    riskLevel?: 'high' | 'medium' | 'low';
}

export interface AISuggestion {
    id: string;
    confidence: number;
    category: SuggestionCategory;
    title: string;
    reasoning: string;
    impact: AISuggestionImpact;
}

/** Project list item — derived from Project + Tasks + TaskAssignments */
export interface ProjectListItem {
    id: string;
    name: string;
    description: string;
    status: string;
    deadline: string;
    health: number;
    progress: number;
    team: string[];
    alert: boolean;
}


/** Notification item (in-app) */
export interface NotificationItem {
    id: number;
    type: 'alert' | 'success' | 'warning' | 'info';
    title: string;
    description: string;
    time: string;
    read: boolean;
}

/** Activity feed item */
export interface ActivityItem {
    user: string;
    action: string;
    target: string;
    project: string | null;
    time: string;
    avatar: string;
}

/** Activity feed group */
export interface ActivityGroup {
    date: string;
    items: ActivityItem[];
}

/** Report: capacity trend data point */
export interface CapacityTrendPoint {
    week: string;
    engineering: number;
    design: number;
    product: number;
}

/** Report: role distribution row */
export interface RoleDistribution {
    role: string;
    allocated: number;
    available: number;
    utilization: number;
}

/** Report: resource anomaly */
export interface ResourceAnomaly {
    name: string;
    role: string;
    issue: string;
    impact: string;
}

/** Report: project health trend point */
export interface HealthTrendPoint {
    month: string;
    health: number;
    risks: number;
}

/** Report: project health row */
export interface ProjectHealthRow {
    name: string;
    health: number;
    trend: string;
    issues: number;
    budget: number;
}

/** Project health metrics — used for scoring and visualization */
export interface ProjectHealthMetrics {
    compositeScore: number;
    schedule: number;
    resource: number;
    risk: number;
    quality: number;
}

/** Aggregated project health report */
export interface ProjectHealthReport {
    health: ProjectHealthMetrics;
    lastUpdated: string;
    projectId: string;
}

/** Employee project view */
export interface EmployeeProjectView {
    id: number;
    name: string;
    dates: string;
    remaining: string;
    health: number;
    healthColor: string;
    status: string;
    statusColor: string;
    progress: number;
    yourHours: string;
    team: string[];
    insight: { text: string; type: string } | null;
}

/** Employee weekly work row */
export interface EmployeeWeeklyWork {
    name: string;
    allocated: string;
    status: string;
    progress: number;
    statusColor: string;
}

/** Employee upcoming deadline */
export interface EmployeeDeadline {
    date: string;
    title: string;
    sub: string;
    iconName: string;
}

/** Timesheet week row data */
export interface WeekRowData {
    id: string;
    type: 'project' | 'adhoc';
    project: string;
    task: string;
    suggested: number[];
    hours: number[];
}

/** Timesheet week metadata */
export interface TimesheetWeekMeta {
    status: string;
    rows: WeekRowData[];
}

/** Past weeks summary */
export interface PastWeekSummary {
    offset: number;
    label: string;
    hours: number;
    status: 'Approved' | 'Pending Review';
}

/** Leave history entry */
export interface LeaveHistoryEntry {
    type: string;
    start: string;
    end: string;
    duration: string;
    status: string;
    notes: string;
}

/** Manager leave request view */
export interface ManagerLeaveRequestView {
    employee: string;
    dateRange: string;
    type: string;
    hours: number;
    status: string;
    avatar: string;
    daysCount: number;
}

// ── UI-only types (not stored in DB) ───────────────────────────

/** Navigation item in sidebar */
export interface NavItem {
    id: string;
    path: string;
    label: string;
    icon: React.ReactNode;
    badge: number;
}

/** KPI card data */
export interface KPIData {
    label: string;
    value: string | number;
    sublabel?: string;
    trend?: 'up' | 'down';
}

/** Dashboard summary data */
export interface DashboardData {
    kpis: KPIData[];
    deadlines: Deadline[];
    gantt: GanttMember[];
    weekDates: any[]; // Deprecated but kept for type compliance
}

/** Team member (Gantt row) */
export interface GanttMember {
    id: string; // Unique identifier for the team member
    email?: string; // Email for uniqueness checking
    name: string;
    role: string;
    avatar: string;
    tasks: GanttTask[];
}

export interface GanttTask {
    id: string; // Task ID for database updates
    name: string;
    start?: number;
    duration?: number;
    status: 'not_started' | 'in_progress' | 'blocked' | 'completed'; // Actual database status values
    displayStatus?: 'track' | 'risk'; // Display status for UI (optional)
    project: string;
    startDate: string; // Restored for UI compatibility
    endDate: string;   // Restored for UI compatibility
}

/** Upcoming deadline */
export interface Deadline {
    id: string;
    project: string;
    deadline: string;
    daysLeft: number;
    status: string;
}

/** Notification */
export interface AppNotification {
    id: number;
    title: string;
    message: string;
    time: string;
    type: string;
    path: string;
    read: boolean;
}

/** Role configuration (Settings) */
export interface RoleConfig {
    id: string;
    name: string;
    utilizationTarget: number;
    billableRate: number;
    permissions: string[];
    color: string;
}

/** Permission definition */
export interface Permission {
    key: string;
    label: string;
}

/** Notification preference categories */
export interface NotifCategory {
    key: string;
    label: string;
    description: string;
}

/** Integration definition */
export interface Integration {
    name: string;
    description: string;
    connected: boolean;
}

/** Capacity data point (chart) */
export interface CapacityDataPoint {
    week: string;
    utilization: number;
    available: number;
}

/** Team member (setup screen) */
export interface SetupTeamMember {
    name: string;
    email: string;
    role: string;
    skills: string[];
}

/** Employee dashboard: task */
export interface EmpDashboardTask {
    id: string;
    title: string;
    project: string;
    status: 'In Progress' | 'Not Started';
    dueDate: string;
}

/** Employee dashboard: alert */
export interface EmpDashboardAlert {
    id: string;
    type: 'warning' | 'info' | 'success';
    icon: string;
    title: string;
    description: string;
    secondaryText?: string;
    actionLabel?: string;
    actionPath?: string;
    bgColor: string;
    borderColor: string;
}

/** Employee dashboard: activity */
export interface EmpDashboardActivity {
    id: string;
    timestamp: string;
    description: string;
}
