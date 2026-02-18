# Code Analysis Tools - Quick Reference

## 🚀 Quick Start

Run the complete analysis suite:

```bash
npm run analyze
```

This will generate comprehensive reports about your codebase quality.

## 📊 What Gets Analyzed

### 1. **Duplication Analysis**
- Unused exports (dead code)
- Circular dependencies
- Dependency structure validation

### 2. **Component Size Measurement**
- Components larger than 300 lines
- Hooks doing too much (>100 lines)
- Files importing 15+ dependencies

### 3. **UI vs Logic Ratio**
- Calculates the balance between UI and business logic
- Helps identify architectural issues

### 4. **Complexity Analysis**
- Cyclomatic complexity (>15)
- Function size (>100 lines)
- Nesting depth (>4 levels)
- Too many parameters (>5)

## 📁 Output Files

After running `npm run analyze`, check these files:

| File | Description |
|------|-------------|
| `ANALYSIS_REPORT.md` | Main report with all findings |
| `reports/ANALYSIS_SUMMARY.md` | Quick overview |
| `reports/ts-prune-report.txt` | Unused exports |
| `reports/madge-circular.txt` | Circular dependencies |
| `reports/eslint-complexity.txt` | Complexity issues |
| `reports/madge-dependencies.json` | Full dependency graph |

## 🔧 Individual Commands

Run specific analysis tools:

```bash
# Analyze component sizes and structure
npm run analyze:codebase

# Find unused exports
npm run analyze:unused

# Check for circular dependencies
npm run analyze:circular

# Run complexity checks
npm run analyze:complexity

# Run duplication analysis
npm run analyze:duplicates
```

## 📈 Understanding Results

### Refactor Priorities

**Critical (Fix immediately):**
- ❗ Files > 500 lines
- ❗ Circular dependencies
- ❗ Complexity > 20

**High Priority:**
- ⚠️ Components 300-500 lines
- ⚠️ Files with 20+ imports
- ⚠️ Complexity 15-20

**Medium Priority:**
- 📝 Unused exports
- 📝 Hooks > 100 lines
- 📝 UI:Logic ratio imbalance

### Example Output

```
🎨 Large Components (>300 lines)
- src/pages/Dashboard.tsx - 450 lines (23 imports) ← REFACTOR TARGET

🪝 Complex Hooks (>100 lines)
- src/hooks/useData.ts - 120 lines (8 imports) ← REFACTOR TARGET

📦 High Dependency Files (15+ imports)
- src/pages/Main.tsx - 22 imports ← REFACTOR TARGET

📊 UI vs Logic Ratio: 6.5:1
⚠️ High UI-to-Logic ratio. Consider extracting more business logic.
```

## 📚 Full Documentation

For detailed usage instructions, best practices, and troubleshooting, see:
- **[CODE_ANALYSIS_GUIDE.md](./CODE_ANALYSIS_GUIDE.md)** - Complete guide

## 🔄 Continuous Integration

Add to your CI pipeline to catch issues early:

```yaml
- name: Code Analysis
  run: npm run analyze
```

## 💡 Tips

1. **Run regularly** - Check before major refactors
2. **Track trends** - Compare reports over time
3. **Set limits** - Don't let components grow beyond 500 lines
4. **Prioritize** - Focus on high-impact refactorings first

---

**Need help?** Check [CODE_ANALYSIS_GUIDE.md](./CODE_ANALYSIS_GUIDE.md) for detailed documentation.
