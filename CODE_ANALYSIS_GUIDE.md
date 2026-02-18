# 🔍 Code Analysis Guide

This guide explains how to use the code analysis tools integrated into this project.

## Overview

The analysis system helps identify refactoring targets by analyzing:
- **Duplication** - Unused exports and circular dependencies
- **Component Size** - Large components and hooks
- **Dependencies** - Files with too many imports
- **Complexity** - Complex functions and deep nesting
- **Architecture** - UI vs Logic file ratio

## Quick Start

### Run Complete Analysis

```bash
npm run analyze
```

This runs all analysis tools and generates comprehensive reports in:
- `ANALYSIS_REPORT.md` - Main detailed report
- `reports/` directory - Individual tool reports

### Individual Analysis Commands

```bash
# Analyze component size, hooks, and dependencies
npm run analyze:codebase

# Check for unused exports
npm run analyze:unused

# Find circular dependencies
npm run analyze:circular

# Run ESLint complexity checks
npm run analyze:complexity

# Run duplication analysis (ts-prune, madge, depcruise)
npm run analyze:duplicates
```

## Analysis Tools

### 1. ts-prune - Unused Exports

Identifies exported code that is never imported anywhere.

**What it finds:**
- Unused functions, classes, and components
- Dead code that can be safely removed

**How to use:**
```bash
npm run analyze:unused
```

**Interpreting results:**
- Each line shows a file and unused export
- Remove unused exports to reduce bundle size
- Be cautious with public API exports

### 2. madge - Circular Dependencies

Detects circular import chains that can cause issues.

**What it finds:**
- Files that import each other directly or indirectly
- Dependency visualization

**How to use:**
```bash
npm run analyze:circular
```

**Interpreting results:**
- Circular dependencies should be refactored
- Break circles by extracting shared code
- Consider using dependency injection

### 3. dependency-cruiser - Dependency Rules

Validates dependency structure and architectural rules.

**What it finds:**
- Dependency violations
- Import path issues
- Architectural boundaries

**How to use:**
```bash
npm run analyze:duplicates  # Includes depcruise
```

### 4. Codebase Structure Analysis

Custom analysis tool that measures component and hook size.

**What it finds:**
- Components > 300 lines (refactor targets)
- Hooks > 100 lines (doing too much)
- Files with 15+ imports (high coupling)
- UI vs Logic ratio

**How to use:**
```bash
npm run analyze:codebase
```

**Interpreting results:**
- Large components should be split into smaller ones
- Complex hooks should be broken down
- High dependency files need refactoring
- UI:Logic ratio indicates architecture balance

### 5. ESLint Complexity Rules

Checks code complexity using static analysis.

**What it finds:**
- Functions with cyclomatic complexity > 15
- Functions longer than 100 lines
- Deep nesting (> 4 levels)
- Too many parameters (> 5)

**How to use:**
```bash
npm run analyze:complexity
```

**Interpreting results:**
- High complexity = hard to test and maintain
- Refactor into smaller functions
- Reduce nesting with early returns

## Understanding the Reports

### ANALYSIS_REPORT.md

Main report with four sections:

#### 🎨 Large Components (>300 lines)
Components that should be split:
```
- src/components/Dashboard.tsx - 450 lines (23 imports)
```
**Action:** Extract sub-components, separate logic

#### 🪝 Complex Hooks (>100 lines)
Hooks doing too much:
```
- src/hooks/useDataFetcher.ts - 120 lines (8 imports)
```
**Action:** Split into multiple focused hooks

#### 📦 High Dependency Files (15+ imports)
Files with too many dependencies:
```
- src/pages/MainPage.tsx - 22 imports (380 lines)
```
**Action:** Reduce coupling, use composition

#### 📊 UI vs Logic Ratio
```
- UI Files: 45 (60%)
- Logic Files: 30 (40%)
- Ratio: 1.5:1
```
**Ideal Ratio:** Between 0.5:1 and 2:1

### reports/ Directory

Contains raw output from each tool:
- `ts-prune-report.txt` - Unused export details
- `madge-circular.txt` - Circular dependency chains
- `madge-dependencies.json` - Full dependency graph
- `depcruise-report.txt` - Dependency violations
- `codebase-analysis.txt` - Console output of structure analysis
- `eslint-complexity.txt` - ESLint warnings and errors
- `ANALYSIS_SUMMARY.md` - Quick overview

## Refactoring Priorities

When you run the analysis, prioritize fixing issues in this order:

### 1. Critical Issues (Fix First)
- ❗ Circular dependencies
- ❗ Files > 500 lines
- ❗ Complexity > 20

### 2. High Priority
- ⚠️ Components 300-500 lines
- ⚠️ Files with 20+ imports
- ⚠️ Hooks > 150 lines

### 3. Medium Priority
- 📝 Complexity 15-20
- 📝 Unused exports
- 📝 Hooks 100-150 lines

### 4. Nice to Have
- ✨ Files with 15-20 imports
- ✨ Deep nesting (4 levels)

## Best Practices

### For Components
```typescript
// ❌ Bad - 400 lines, 25 imports
import { /* 25 imports */ } from '...'

export function Dashboard() {
  // 400 lines of JSX and logic
}

// ✅ Good - Split into smaller components
export function Dashboard() {
  return (
    <>
      <DashboardHeader />
      <DashboardStats />
      <DashboardCharts />
    </>
  )
}
```

### For Hooks
```typescript
// ❌ Bad - One hook doing everything
function useDataManager() {
  // Fetching, caching, validation, formatting...
  // 150 lines
}

// ✅ Good - Focused hooks
function useDataFetch() { /* ... */ }
function useDataCache() { /* ... */ }
function useDataValidation() { /* ... */ }
```

### For Dependencies
```typescript
// ❌ Bad - Too many imports
import { a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p } from './utils'

// ✅ Good - Barrel exports and fewer dependencies
import { essentialUtils } from './utils'
```

## Continuous Monitoring

### Add to CI/CD

Add to your CI pipeline:
```yaml
# .github/workflows/analysis.yml
- name: Run Code Analysis
  run: npm run analyze

- name: Check for Critical Issues
  run: |
    if grep -q "Total Refactor Targets: [3-9][0-9]" ANALYSIS_REPORT.md; then
      echo "Too many refactor targets!"
      exit 1
    fi
```

### Regular Reviews

Run analysis:
- Before major refactoring
- After adding new features
- Monthly as part of tech debt review
- When bundle size increases

## Troubleshooting

### "command not found" errors
```bash
npm install  # Reinstall dependencies
```

### Permission denied
```bash
chmod +x scripts/analysis/*.sh
```

### Out of memory
```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run analyze
```

### False positives in ts-prune
Some exports are used dynamically. Add to `tsconfig.json`:
```json
{
  "ts-prune": {
    "ignore": "some-file.ts"
  }
}
```

## Configuration

### Adjust Thresholds

Edit `scripts/analysis/analyze-codebase.ts`:
```typescript
const COMPONENT_SIZE_THRESHOLD = 300;  // Change to 250 or 400
const DEPENDENCY_THRESHOLD = 15;        // Change to 10 or 20
const HOOK_SIZE_THRESHOLD = 100;        // Change to 50 or 150
```

### ESLint Complexity

Edit `eslint.config.js`:
```javascript
rules: {
  "complexity": ["warn", { max: 15 }],        // Change max
  "max-lines": ["warn", { max: 300 }],        // Change max
  "max-lines-per-function": ["warn", { max: 100 }],
}
```

## Resources

- [ts-prune docs](https://github.com/nadeesha/ts-prune)
- [madge docs](https://github.com/pahen/madge)
- [dependency-cruiser docs](https://github.com/sverweij/dependency-cruiser)
- [ESLint complexity rules](https://eslint.org/docs/latest/rules/complexity)

## Support

If you encounter issues or have suggestions for improving the analysis tools, please open an issue in the repository.

---

**Last Updated:** 2026-02-18
**Maintainer:** Velocity AI Team
