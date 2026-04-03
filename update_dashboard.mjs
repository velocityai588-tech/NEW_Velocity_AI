import fs from 'fs';
import path from 'path';

const filePath = 'src/services/dashboardService.ts';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add import
if (!content.includes('import { calculateProjectHealthScore }')) {
    content = content.replace(
        "import type { KPIData, Deadline, GanttMember } from '@/types';",
        "import type { KPIData, Deadline, GanttMember } from '@/types';\nimport { calculateProjectHealthScore } from './healthService';"
    );
}

// 2. Refactor KPI logic
const targetLine = "const activeProjectsCount = projects?.filter(p => p.status === 'active').length || 0;";
const replacement = `        const activeProjects = projects?.filter(p => p.status !== 'completed' && p.status !== 'archived') || [];
        const activeProjectsCount = activeProjects.length;

        // Calculate At Risk projects using health calculations
        // A project is considered "At Risk" if its composite health score (schedule + resource + risk + quality) is below 70.
        let projectsAtRiskCount = 0;
        activeProjects.forEach(project => {
            const projectTasks = allTasks?.filter(t => t.project_id === project.id) || [];
            const health = calculateProjectHealthScore({
                issues: projectTasks,
                startDate: project.start_date ? new Date(project.start_date) : undefined,
                endDate: project.end_date ? new Date(project.end_date) : undefined,
            });
            if (health.compositeScore < 70) {
                projectsAtRiskCount++;
            }
        });`;

if (content.includes(targetLine)) {
    content = content.replace(
        /const activeProjectsCount = projects\?\.filter\(p => p\.status === 'active'\)\.length \|\| 0;\s+const projectsAtRiskCount = projects\?\.filter\(p => p\.status === 'draft' \|\| p\.status === 'archived'\)\.length \|\| 0;/,
        replacement
    );
} else {
    console.log('Target line not found precisely. Trying fallback.');
    content = content.replace(
        /const activeProjectsCount =.*?\n\s+const projectsAtRiskCount =.*?\n/,
        replacement + '\n'
    );
}

fs.writeFileSync(filePath, content);
console.log('Successfully updated dashboardService.ts');
