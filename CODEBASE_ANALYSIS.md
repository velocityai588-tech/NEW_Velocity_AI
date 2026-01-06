# Velocity AI Codebase Analysis Report

**Generated on:** 2026-01-06

## Executive Summary

This report provides a comprehensive analysis of the Velocity AI codebase, including total file count, lines of code, and word count statistics.

---

## Overall Statistics

| Metric | Count |
|--------|-------|
| **Total Files** | 190 |
| **Total Lines of Code** | 33,679 |
| **Total Words** | 109,532 |

*Note: Excludes .git directory and node_modules*

---

## Source Code Statistics

### TypeScript/JavaScript Files Only

| Metric | Count |
|--------|-------|
| **Source Code Files** | 151 |
| **Lines in Source Files** | 20,094 |
| **Words in Source Files** | 69,376 |

---

## File Type Breakdown

| File Type | Count | Description |
|-----------|-------|-------------|
| `.tsx` | 119 | TypeScript React components |
| `.ts` | 30 | TypeScript files |
| `.csv` | 12 | CSV data files |
| `.json` | 7 | JSON configuration files |
| `.md` | 6 | Markdown documentation |
| `.html` | 4 | HTML files |
| `.svg` | 2 | SVG images |
| `.js` | 2 | JavaScript files |
| `.css` | 2 | CSS stylesheets |
| Others | 5 | Miscellaneous files |

---

## Key Observations

1. **Primary Language:** TypeScript/React (TSX files make up 63% of all files)
2. **Codebase Size:** Medium-sized project with ~20K lines of source code
3. **Documentation:** Well-documented with 6 markdown files
4. **Data Files:** Contains 12 CSV files, suggesting data-driven features
5. **Configuration:** Properly configured with JSON config files

---

## Directory Structure Overview

The codebase is organized into the following main directories:
- `/src` - Main source code
- `/api` - API-related code
- `/demo` - Demo files
- `/docs` - Documentation
- `/public` - Public assets
- `/asana` - Asana integration files

---

## Methodology

Statistics were calculated using the following commands:

```bash
# Total files count
find . -type f ! -path "./.git/*" ! -path "./node_modules/*" | wc -l

# Total lines of code (tail -n 1 gets the final summary line from wc)
find . -type f ! -path "./.git/*" ! -path "./node_modules/*" -exec wc -l {} + | tail -n 1

# Total words (tail -n 1 gets the final summary line from wc)
find . -type f ! -path "./.git/*" ! -path "./node_modules/*" -exec wc -w {} + | tail -n 1

# File type breakdown
find . -type f ! -path "./.git/*" ! -path "./node_modules/*" | sed 's/.*\.//' | sort | uniq -c | sort -rn
```

---

## Conclusion

The Velocity AI codebase is a well-structured TypeScript/React application with approximately **190 files**, **33,679 lines of code**, and **109,532 words**. The project demonstrates good organization with clear separation of concerns and adequate documentation.


---

## Detailed Directory Breakdown

| Directory | Files | Lines | Words | Description |
|-----------|-------|-------|-------|-------------|
| `/src` | 144 | 19,385 | 68,388 | Main source code (React components, hooks, utils) |
| `/public` | 15 | 819 | 4,350 | Public assets and static files (includes 12 CSV files) |
| `/demo` | 4 | 615 | 1,833 | Demo and example files |
| `/docs` | 3 | 532 | 3,281 | Project documentation |
| `/api` | 1 | 258 | 949 | API server code |

*Note: Empty directories like `/asana` are not included in this breakdown.*

**Key Insight:** The `/src` directory contains the vast majority of the codebase (76% of all files, 58% of all lines), which is typical for a React application.

