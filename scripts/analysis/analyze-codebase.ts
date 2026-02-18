#!/usr/bin/env tsx
/**
 * Comprehensive codebase analysis tool
 * Analyzes component size, dependencies, and complexity
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileAnalysis {
  path: string;
  lines: number;
  imports: number;
  exportCount: number;
  isComponent: boolean;
  isHook: boolean;
}

interface AnalysisResult {
  largeComponents: FileAnalysis[];
  complexHooks: FileAnalysis[];
  highDependencyFiles: FileAnalysis[];
  uiVsLogicRatio: {
    uiFiles: number;
    logicFiles: number;
    totalFiles: number;
    uiPercentage: number;
    logicPercentage: number;
  };
}

const COMPONENT_SIZE_THRESHOLD = 300;
const DEPENDENCY_THRESHOLD = 15;
const HOOK_SIZE_THRESHOLD = 100; // Hooks should generally be smaller

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').filter(line => line.trim() !== '').length;
}

function countImports(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  const importRegex = /^import\s+.*?from\s+['"].*?['"];?/gm;
  const matches = content.match(importRegex);
  return matches ? matches.length : 0;
}

function countExports(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf-8');
  const exportRegex = /^export\s+(default\s+)?(function|class|const|interface|type|enum)/gm;
  const matches = content.match(exportRegex);
  return matches ? matches.length : 0;
}

function isComponentFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  // Check if it's a React component (starts with uppercase or ends with Component)
  return /^[A-Z].*\.(tsx|jsx)$/.test(fileName) || fileName.includes('Component');
}

function isHookFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName.startsWith('use') && (fileName.endsWith('.ts') || fileName.endsWith('.tsx'));
}

function isUIFile(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  // UI files typically have JSX/TSX and render functions
  return /\.(tsx|jsx)$/.test(filePath) && 
         (content.includes('return (') || content.includes('return<') || content.includes('<'));
}

function isLogicFile(filePath: string): boolean {
  // Logic files: services, hooks, utilities, contexts, libs
  return /\/(services|hooks|lib|utils|contexts|api)\//i.test(filePath) ||
         /\.(service|util|helper|hook)\.(ts|tsx)$/i.test(filePath);
}

function getAllTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and other irrelevant directories
      if (!['node_modules', 'dist', 'build', '.git'].includes(file)) {
        getAllTypeScriptFiles(filePath, fileList);
      }
    } else if (/\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function analyzeFile(filePath: string): FileAnalysis {
  return {
    path: filePath,
    lines: countLines(filePath),
    imports: countImports(filePath),
    exportCount: countExports(filePath),
    isComponent: isComponentFile(filePath),
    isHook: isHookFile(filePath),
  };
}

function runAnalysis(srcDir: string): AnalysisResult {
  console.log('🔍 Analyzing codebase...\n');

  const files = getAllTypeScriptFiles(srcDir);
  console.log(`📁 Found ${files.length} TypeScript files\n`);

  const analyses = files.map(analyzeFile);

  // Find large components
  const largeComponents = analyses
    .filter(a => a.isComponent && a.lines > COMPONENT_SIZE_THRESHOLD)
    .sort((a, b) => b.lines - a.lines);

  // Find complex hooks
  const complexHooks = analyses
    .filter(a => a.isHook && a.lines > HOOK_SIZE_THRESHOLD)
    .sort((a, b) => b.lines - a.lines);

  // Find files with many dependencies
  const highDependencyFiles = analyses
    .filter(a => a.imports >= DEPENDENCY_THRESHOLD)
    .sort((a, b) => b.imports - a.imports);

  // Calculate UI vs Logic ratio
  const uiFiles = analyses.filter(a => isUIFile(a.path)).length;
  const logicFiles = analyses.filter(a => isLogicFile(a.path)).length;
  const totalFiles = files.length;

  const uiVsLogicRatio = {
    uiFiles,
    logicFiles,
    totalFiles,
    uiPercentage: (uiFiles / totalFiles) * 100,
    logicPercentage: (logicFiles / totalFiles) * 100,
  };

  return {
    largeComponents,
    complexHooks,
    highDependencyFiles,
    uiVsLogicRatio,
  };
}

function generateReport(result: AnalysisResult): string {
  let report = '# 📊 Codebase Analysis Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;

  // Large Components Section
  report += '## 🎨 Large Components (>300 lines)\n\n';
  if (result.largeComponents.length > 0) {
    report += '**These components are refactor targets:**\n\n';
    result.largeComponents.forEach(comp => {
      report += `- \`${comp.path}\` - **${comp.lines} lines** (${comp.imports} imports)\n`;
    });
    report += `\n**Total:** ${result.largeComponents.length} large components\n\n`;
  } else {
    report += '✅ No components exceed 300 lines.\n\n';
  }

  // Complex Hooks Section
  report += '## 🪝 Complex Hooks (>100 lines)\n\n';
  if (result.complexHooks.length > 0) {
    report += '**These hooks are doing too much:**\n\n';
    result.complexHooks.forEach(hook => {
      report += `- \`${hook.path}\` - **${hook.lines} lines** (${hook.imports} imports)\n`;
    });
    report += `\n**Total:** ${result.complexHooks.length} complex hooks\n\n`;
  } else {
    report += '✅ All hooks are reasonably sized.\n\n';
  }

  // High Dependency Files Section
  report += '## 📦 High Dependency Files (15+ imports)\n\n';
  if (result.highDependencyFiles.length > 0) {
    report += '**These files have too many dependencies:**\n\n';
    result.highDependencyFiles.forEach(file => {
      report += `- \`${file.path}\` - **${file.imports} imports** (${file.lines} lines)\n`;
    });
    report += `\n**Total:** ${result.highDependencyFiles.length} files with high dependencies\n\n`;
  } else {
    report += '✅ No files exceed 15 imports.\n\n';
  }

  // UI vs Logic Ratio Section
  report += '## 📊 UI vs Logic Ratio\n\n';
  report += `- **UI Files:** ${result.uiVsLogicRatio.uiFiles} (${result.uiVsLogicRatio.uiPercentage.toFixed(1)}%)\n`;
  report += `- **Logic Files:** ${result.uiVsLogicRatio.logicFiles} (${result.uiVsLogicRatio.logicPercentage.toFixed(1)}%)\n`;
  report += `- **Total Files:** ${result.uiVsLogicRatio.totalFiles}\n\n`;

  const ratio = result.uiVsLogicRatio.uiFiles / result.uiVsLogicRatio.logicFiles;
  report += `**Ratio:** ${ratio.toFixed(2)}:1 (UI:Logic)\n\n`;

  if (ratio > 2) {
    report += '⚠️ High UI-to-Logic ratio. Consider extracting more business logic.\n\n';
  } else if (ratio < 0.5) {
    report += '⚠️ Low UI-to-Logic ratio. UI might be spread across too many files.\n\n';
  } else {
    report += '✅ Healthy UI-to-Logic ratio.\n\n';
  }

  // Summary
  report += '## 📋 Summary\n\n';
  const totalIssues = result.largeComponents.length + result.complexHooks.length + result.highDependencyFiles.length;
  report += `**Total Refactor Targets:** ${totalIssues}\n\n`;

  if (totalIssues > 0) {
    report += '### Recommendations:\n\n';
    if (result.largeComponents.length > 0) {
      report += '1. Break down large components into smaller, reusable components\n';
    }
    if (result.complexHooks.length > 0) {
      report += '2. Split complex hooks into smaller, focused hooks\n';
    }
    if (result.highDependencyFiles.length > 0) {
      report += '3. Reduce dependencies by extracting shared logic and using dependency injection\n';
    }
  } else {
    report += '✅ Codebase structure looks healthy!\n';
  }

  return report;
}

// Main execution
const srcDir = path.join(process.cwd(), 'src');
if (!fs.existsSync(srcDir)) {
  console.error('❌ Error: src directory not found');
  process.exit(1);
}

const result = runAnalysis(srcDir);
const report = generateReport(result);

// Print to console
console.log(report);

// Save to file
const reportPath = path.join(process.cwd(), 'ANALYSIS_REPORT.md');
fs.writeFileSync(reportPath, report);
console.log(`\n✅ Report saved to: ${reportPath}`);
