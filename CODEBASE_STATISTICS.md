# Codebase Statistics Report

**Project:** NEW_Velocity_AI  
**Analysis Date:** February 18, 2026  
**Repository:** velocityai588-tech/NEW_Velocity_AI

---

## 📊 Grand Totals

### **TOTAL LINES OF CODE: 41,242 lines**
### **TOTAL WORD COUNT: 146,514 words**

*(Excludes node_modules, .git directories, and package-lock.json)*

---

## 📁 File Distribution

| Category | Count |
|----------|-------|
| **Total Files Analyzed** | 251 |
| TypeScript/JavaScript Files | 212 |
| Markdown Files | 6 |
| HTML Files | 4 |
| JSON Files | 8 |
| SVG Files | 3 |
| CSS Files | 2 |

---

## 💻 Code Statistics by Language

### TypeScript & JavaScript Breakdown

| File Type | Lines of Code | Word Count |
|-----------|--------------|------------|
| **TypeScript (.ts)** | 6,644 | 22,644 |
| **TypeScript React (.tsx)** | 27,952 | 95,691 |
| **JavaScript (.js)** | 32 | 72 |
| **JavaScript React (.jsx)** | 0 | 0 |
| **Total TS/JS** | 34,628 | 118,407 |

### Other File Types

| File Type | Lines of Code |
|-----------|--------------|
| **Markdown (.md)** | 1,488 |
| **HTML** | 1,720 |
| **JSON** (excl. package-lock) | 239 |
| **SVG** | 416 |

---

## 📂 Directory Breakdown

### Main Directories

- **src/** - 200 files (Main source code)
- **api/** - 5 files (API endpoints)
- **public/** - 10 files (Public assets)
- **demo/** - Demo components
- **archives/** - Archived files
- **asana/** - Asana integration
- **supabase-migrations/** - Database migrations

---

## 🎯 Key Insights

1. **Primary Language:** TypeScript React (.tsx) with 27,952 lines (~68% of code)
2. **Total TypeScript/JavaScript:** 34,628 lines
3. **Documentation:** 1,488 lines of Markdown documentation
4. **File Organization:** 251 files across 7 main directories
5. **Project Type:** React/TypeScript web application with API backend

---

## 📈 Additional Statistics

### With package-lock.json included:
- **Total Lines:** 51,339
- **Total Words:** 165,843

---

## 🔍 Analysis Methodology

This analysis was performed using the following tools:
- `find` - To locate all relevant files
- `wc` - To count lines and words
- Excluded: node_modules, .git, dist, build directories

**Command Used:**
```bash
find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -not -path "*/dist/*" -not -path "*/build/*" \
  -not -name "package-lock.json" | xargs wc -l -w
```

---

*Report Generated: February 18, 2026*
