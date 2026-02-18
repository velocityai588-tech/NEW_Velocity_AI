# Example Analysis Report

This document shows what to expect when running `npm run analyze`.

## 🎯 Sample Output

When you run the analysis, you'll see output like this in your terminal:

```
🚀 Starting Comprehensive Code Analysis
========================================

📊 Step 1/4: Running duplication analysis...
🔍 Running Duplication Analysis
================================

📦 Step 1: Finding unused exports with ts-prune...
✅ ts-prune analysis complete. Results saved to reports/ts-prune-report.txt

🔄 Step 2: Checking circular dependencies with madge...
✔ No circular dependency found!

📊 Generating dependency tree...
✅ Dependency analysis complete. Results saved to reports/madge-*.txt

🚢 Step 3: Running dependency-cruiser...
✅ Dependency cruiser analysis complete. Results saved to reports/depcruise-report.txt

📊 Step 2/4: Analyzing codebase structure...
🔍 Analyzing codebase...
📁 Found 196 TypeScript files

📊 Step 3/4: Running ESLint complexity analysis...
✅ ESLint analysis complete. Results saved to reports/eslint-complexity.txt

📊 Step 4/4: Generating summary...
✅ Analysis Complete!
```

## 📄 Main Report: ANALYSIS_REPORT.md

### Example Content:

```markdown
# 📊 Codebase Analysis Report

Generated: 2026-02-18T17:36:14.934Z

## 🎨 Large Components (>300 lines)

**These components are refactor targets:**

- `src/pages/VelocityAI.tsx` - **1075 lines** (22 imports)
- `src/components/demo2/CapacityLedgerTab.tsx` - **833 lines** (3 imports)
- `src/components/demo2/VPDashboard.tsx` - **789 lines** (3 imports)
- `src/components/demo/DeploymentView.tsx` - **787 lines** (12 imports)
- `src/components/ManagerGantt.tsx` - **701 lines** (4 imports)
...

**Total:** 20 large components

## 🪝 Complex Hooks (>100 lines)

**These hooks are doing too much:**

- `src/hooks/use-toast.ts` - **156 lines** (2 imports)
- `src/hooks/useJiraData.ts` - **138 lines** (3 imports)

**Total:** 2 complex hooks

## 📦 High Dependency Files (15+ imports)

**These files have too many dependencies:**

- `src/App.tsx` - **26 imports** (66 lines)
- `src/pages/VelocityAI.tsx` - **22 imports** (1075 lines)

**Total:** 2 files with high dependencies

## 📊 UI vs Logic Ratio

- **UI Files:** 156 (79.6%)
- **Logic Files:** 24 (12.2%)
- **Total Files:** 196

**Ratio:** 6.50:1 (UI:Logic)

⚠️ High UI-to-Logic ratio. Consider extracting more business logic.

## 📋 Summary

**Total Refactor Targets:** 24

### Recommendations:

1. Break down large components into smaller, reusable components
2. Split complex hooks into smaller, focused hooks
3. Reduce dependencies by extracting shared logic and using dependency injection
```

## 📁 Individual Reports

### reports/ts-prune-report.txt
Lists all unused exports in your codebase:
```
(empty if no unused exports)
```

### reports/madge-circular.txt
Shows circular dependency chains:
```
✔ No circular dependency found!
```

### reports/madge-dependencies.json
Complete dependency graph in JSON format:
```json
{
  "src/App.tsx": [
    "src/components/Header.tsx",
    "src/hooks/useAuth.ts",
    "src/lib/utils.ts"
  ],
  "src/components/Header.tsx": [
    "src/components/ui/button.tsx"
  ]
}
```

### reports/eslint-complexity.txt
ESLint findings for complexity:
```
/src/pages/VelocityAI.tsx
  394:1   warning  File has too many lines (1014). Maximum allowed is 300
  1023:16 warning  Function 'VelocityAI' has too many lines (184)
  1023:16 warning  Function 'VelocityAI' has a complexity of 20

/src/api/jira/routes.ts
  164:57  warning  Arrow function has a complexity of 19
  390:1   warning  File has too many lines (503)
  406:11  warning  Blocks are nested too deeply (5)
```

### reports/ANALYSIS_SUMMARY.md
Quick overview of all completed checks:
```markdown
# 🔍 Code Analysis Summary

Generated: Wed Feb 18 17:37:15 UTC 2026

## 📋 Analysis Steps Completed

1. ✅ Duplication Analysis (ts-prune, madge, dependency-cruiser)
2. ✅ Component Size Analysis
3. ✅ Complexity Analysis (ESLint)
4. ✅ UI vs Logic Ratio Calculated

## 🎯 Next Steps

1. Review `ANALYSIS_REPORT.md` for detailed findings
2. Check individual report files for specific issues
3. Prioritize refactoring based on severity
```

## 🎯 How to Use the Results

### Priority 1: Fix Critical Issues
Look for files marked with these patterns in ANALYSIS_REPORT.md:
- Components > 500 lines
- Complexity > 20
- Circular dependencies

### Priority 2: Address High Impact
- Components 300-500 lines
- Files with 20+ imports
- Hooks > 150 lines

### Priority 3: Gradual Improvement
- Files with 15-20 imports
- Unused exports
- Moderate complexity (15-20)

## 🔄 Rerun Analysis

After making refactoring changes, rerun the analysis to see improvements:

```bash
npm run analyze
```

Compare the new reports with previous ones to track progress!

## 💡 Tips for Interpreting Results

### Large Components
If you see components with 500+ lines:
1. Look for logical sections that can be extracted
2. Create smaller sub-components
3. Move business logic to custom hooks or services

### High Dependencies
If files have 20+ imports:
1. Check if all imports are necessary
2. Consider creating barrel exports
3. Use dependency injection patterns

### UI vs Logic Ratio
Ideal ratio: **0.5:1 to 2:1**
- If ratio > 2:1 → Extract more business logic
- If ratio < 0.5:1 → Consolidate UI components

### Complexity Warnings
Functions with complexity > 15:
1. Break into smaller functions
2. Use early returns to reduce nesting
3. Extract conditional logic

## 📊 Tracking Improvements

### Before Refactoring
```
Total Refactor Targets: 24
- Large Components: 20
- Complex Hooks: 2
- High Dependency Files: 2
```

### After Refactoring
```
Total Refactor Targets: 12
- Large Components: 9
- Complex Hooks: 1
- High Dependency Files: 2
```

**Progress: 50% reduction in refactor targets! 🎉**

---

**For more details:** See [CODE_ANALYSIS_GUIDE.md](./CODE_ANALYSIS_GUIDE.md)
