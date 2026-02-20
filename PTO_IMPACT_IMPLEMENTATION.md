# PTO Impact Calculation Implementation

This document describes the PTO Impact feature implementation for the Leave Management Portal.

## Overview

The PTO Impact Calculator analyzes the impact of employee PTO on task assignment and completion probability. It uses Jira issue data and employee information to provide recommendations on task delegation and potential deferrals.

## API Endpoint

**POST** `/api/leave-approval/pto-impact`

### Request Body

```json
{
  "task": {
    "title": "Implement API endpoint",
    "priority": "high",
    "complexity": 3,
    "deadline_hours": 40,
    "skills_required": ["TypeScript", "Express", "API Design"]
  },
  "candidates": [
    {
      "id": "emp-1",
      "name": "Alice Developer",
      "current_load": 20,
      "skills": ["TypeScript", "Express", "React"],
      "role_level": "Senior Engineer",
      "avg_completion_time": 8,
      "efficiency_score": 0.85,
      "base_productive_hours": 40,
      "pto_hours_this_week": 8,
      "holiday_hours_this_week": 0
    }
  ],
  "start_date": "2026-02-20"
}
```

### Response

```json
{
  "impact_analysis": [
    {
      "employee_id": "emp-1",
      "name": "Alice Developer",
      "initial_available_hours": 20,
      "pto_deduction_hours": 8,
      "net_available_after_pto": 12,
      "timeline_impact_days": 3,
      "task_completion_probability": 0.65
    }
  ],
  "recommended_candidate_id": "emp-1",
  "deferral_recommendation": true
}
```

## Frontend Integration

### Using the Hook

```tsx
import { usePTOImpact } from '@/hooks/usePTOImpact';

function TaskAssignmentComponent() {
  const task = {
    title: "Urgent Feature",
    priority: "high",
    complexity: 3,
    deadline_hours: 40,
    skills_required: ["TypeScript", "API"]
  };

  const { impact, loading, error, recommendedEmployee } = usePTOImpact({
    task,
    ptoSchedule: {
      "Alice Developer": { pto_hours: 8, holiday_hours: 0 },
      "Bob Engineer": { pto_hours: 0, holiday_hours: 8 }
    },
    startDate: "2026-02-20",
    enabled: true
  });

  if (loading) return <div>Analyzing impact...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {recommendedEmployee && (
        <p>Recommended: {recommendedEmployee.name}</p>
      )}
      {impact?.deferral_recommendation && (
        <p>⚠️ Consider deferring this task</p>
      )}
    </div>
  );
}
```

### Using the Component

```tsx
import { PTOImpactPanel } from '@/components/leave-management';

function LeaveSelectionForm() {
  const task = {
    title: "Fix production issue",
    priority: "critical",
    complexity: 2,
    deadline_hours: 8,
    skills_required: ["Debugging"]
  };

  const candidates = [
    {
      id: "alice",
      name: "Alice",
      current_load: 30,
      skills: ["Debugging", "TypeScript"],
      role_level: "Senior",
      avg_completion_time: 8,
      efficiency_score: 0.9,
      base_productive_hours: 40,
      pto_hours_this_week: 0,
      holiday_hours_this_week: 0
    }
  ];

  return (
    <PTOImpactPanel
      task={task}
      candidates={candidates}
      startDate="2026-02-20"
      onRecommendedChange={(candidateId) => console.log("Recommended:", candidateId)}
    />
  );
}
```

### Using the Service

```tsx
import { fetchPTOImpact, convertJiraToCandidate } from '@/lib/ptoCaculatorService';

async function calculatePTOImpact() {
  const task = {
    title: "API Integration",
    priority: "high",
    complexity: 3,
    deadline_hours: 40,
    skills_required: ["Node.js", "REST API"]
  };

  const candidates = [
    {
      id: "dev-1",
      name: "Developer One",
      current_load: 20,
      skills: ["Node.js", "REST API"],
      role_level: "Engineer",
      avg_completion_time: 8,
      efficiency_score: 0.8,
      base_productive_hours: 40,
      pto_hours_this_week: 4,
      holiday_hours_this_week: 0
    }
  ];

  const impact = await fetchPTOImpact(task, candidates, "2026-02-20");
  
  if (impact) {
    console.log("Recommended:", impact.recommended_candidate_id);
    console.log("Defer?", impact.deferral_recommendation);
    
    impact.impact_analysis.forEach(analysis => {
      console.log(`${analysis.name}:`, {
        available: analysis.net_available_after_pto,
        probability: analysis.task_completion_probability,
        delay: analysis.timeline_impact_days
      });
    });
  }
}
```

## Integration with Leave Management Portal

The PTO Impact feature is automatically integrated into the leave management portal:

1. **Task Assignment Screen**: When assigning a task during leave approval, the system shows PTO impact analysis
2. **Employee Selection**: Recommends best person based on availability and PTO schedule
3. **Deferral Suggestions**: Alerts if task should be deferred due to insufficient capacity
4. **Timeline Projections**: Shows potential delays based on PTO schedules

## Business Logic

### Completion Probability Calculation

```
Probability = (Skill Match × 0.4) + (Capacity Ratio × 0.4) + (Efficiency × 0.2)

Where:
- Skill Match: How well employee skills match task requirements (0-1)
- Capacity Ratio: Available hours vs. required hours (0-1)  
- Efficiency: Employee's historical completion efficiency (0-1)
```

### Timeline Impact

```
Days of Delay = ceil(
  (Task Hours - Available Hours After PTO) / 8
)
```

### Deferral Recommendation

Task should be deferred if ANY of:
- Employee probability < 40%
- Employee has no available hours after PTO
- All candidates are overbooked

## Files

- **Backend Business Logic**: `src/lib/ptoCaculator.ts`
- **API Endpoint**: `src/api/leave-approval/routes.ts` (POST /pto-impact)
- **Frontend Service**: `src/lib/ptoCaculatorService.ts`
- **React Hook**: `src/hooks/usePTOImpact.ts`
- **React Component**: `src/components/leave-management/PTOImpactPanel.tsx`

## Future Enhancements

1. Historical pattern analysis for more accurate efficiency scores
2. Cross-project load considerations
3. Skill level degradation during high workload periods
4. Team capacity buffering for risk mitigation
5. Integration with calendar APIs for precise PTO tracking
