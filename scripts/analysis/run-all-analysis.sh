#!/bin/bash

# Master Analysis Script
# Runs comprehensive code analysis including:
# - Duplication analysis (ts-prune, madge, depcruise)
# - Component size analysis
# - Complexity analysis (ESLint)
# - UI vs Logic ratio

set -e  # Exit on error

echo "🚀 Starting Comprehensive Code Analysis"
echo "========================================"
echo ""

# Create reports directory
mkdir -p reports

# Step 1: Run duplication analysis
echo "📊 Step 1/4: Running duplication analysis..."
./scripts/analysis/run-duplication-analysis.sh
echo ""

# Step 2: Run codebase structure analysis
echo "📊 Step 2/4: Analyzing codebase structure..."
npx tsx scripts/analysis/analyze-codebase.ts | tee reports/codebase-analysis.txt
echo ""

# Step 3: Run ESLint with complexity rules
echo "📊 Step 3/4: Running ESLint complexity analysis..."
npm run lint 2>&1 | tee reports/eslint-complexity.txt || true
echo ""
echo "✅ ESLint analysis complete. Results saved to reports/eslint-complexity.txt"
echo ""

# Step 4: Generate summary report
echo "📊 Step 4/4: Generating summary..."
cat << EOF > reports/ANALYSIS_SUMMARY.md
# 🔍 Code Analysis Summary

Generated: $(date)

## 📋 Analysis Steps Completed

1. ✅ **Duplication Analysis** (ts-prune, madge, dependency-cruiser)
   - Unused exports identified
   - Circular dependencies checked
   - Dependency graph generated

2. ✅ **Component Size Analysis**
   - Large components (>300 lines) identified
   - Complex hooks (>100 lines) identified
   - High dependency files (15+ imports) identified

3. ✅ **Complexity Analysis** (ESLint)
   - Cyclomatic complexity checked (max: 15)
   - Function size checked (max: 100 lines)
   - Nesting depth checked (max: 4 levels)

4. ✅ **UI vs Logic Ratio Calculated**
   - UI files vs Logic files ratio computed

## 📁 Generated Reports

- \`reports/ts-prune-report.txt\` - Unused exports
- \`reports/madge-circular.txt\` - Circular dependencies
- \`reports/madge-dependencies.json\` - Full dependency graph
- \`reports/depcruise-report.txt\` - Dependency violations
- \`reports/codebase-analysis.txt\` - Component and hook analysis
- \`reports/eslint-complexity.txt\` - ESLint complexity warnings
- \`ANALYSIS_REPORT.md\` - Detailed analysis report with refactor targets

## 🎯 Next Steps

1. Review \`ANALYSIS_REPORT.md\` for detailed findings
2. Check individual report files for specific issues
3. Prioritize refactoring based on:
   - Components >300 lines
   - Files with 15+ dependencies
   - Circular dependencies (if any)
   - High complexity functions

## 📊 Quick Stats

Run \`npm run analyze\` anytime to regenerate these reports.

EOF

cat reports/ANALYSIS_SUMMARY.md

echo ""
echo "========================================"
echo "✅ Analysis Complete!"
echo ""
echo "📁 All reports saved in the 'reports/' directory"
echo "📄 Main report: ANALYSIS_REPORT.md"
echo "📄 Summary: reports/ANALYSIS_SUMMARY.md"
echo ""
