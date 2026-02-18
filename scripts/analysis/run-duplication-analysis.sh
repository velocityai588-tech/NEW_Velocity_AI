#!/bin/bash

# Duplication Analysis Script
# Runs multiple tools to detect code duplication and unused exports

echo "🔍 Running Duplication Analysis"
echo "================================"
echo ""

# Create output directory
mkdir -p reports

# 1. Run ts-prune to find unused exports
echo "📦 Step 1: Finding unused exports with ts-prune..."
npx ts-prune --error | tee reports/ts-prune-report.txt
echo ""
echo "✅ ts-prune analysis complete. Results saved to reports/ts-prune-report.txt"
echo ""

# 2. Run madge for circular dependencies and module visualization
echo "🔄 Step 2: Checking circular dependencies with madge..."
npx madge --circular --extensions ts,tsx src/ | tee reports/madge-circular.txt
echo ""

echo "📊 Generating dependency tree..."
npx madge --extensions ts,tsx src/ --json > reports/madge-dependencies.json
echo "✅ Dependency analysis complete. Results saved to reports/madge-*.txt"
echo ""

# 3. Run dependency-cruiser for advanced dependency validation
echo "🚢 Step 3: Running dependency-cruiser..."
npx depcruise src --include-only "^src" --output-type err | tee reports/depcruise-report.txt
echo ""
echo "✅ Dependency cruiser analysis complete. Results saved to reports/depcruise-report.txt"
echo ""

echo "================================"
echo "✅ Duplication analysis complete!"
echo ""
echo "Reports generated:"
echo "  - reports/ts-prune-report.txt"
echo "  - reports/madge-circular.txt"
echo "  - reports/madge-dependencies.json"
echo "  - reports/depcruise-report.txt"
echo ""
echo "Review these files to identify refactor targets."
