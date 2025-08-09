#!/usr/bin/env tsx

/**
 * Coverage Report Generator
 * Generates comprehensive coverage reports across all test categories
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface CoverageData {
  category: string;
  lines: number;
  functions: number;
  branches: number;
  statements: number;
  uncoveredLines: string[];
}

class CoverageReportGenerator {
  private coverageData: CoverageData[] = [];

  async generateComprehensiveCoverage(): Promise<void> {
    console.log('📊 Generating Comprehensive Coverage Report...\n');

    // Run tests with coverage for each category
    await this.runCoverageForCategory('Unit Tests', 'npm run test:unit -- --coverage');
    await this.runCoverageForCategory('Integration Tests', 'npm run test:integration -- --coverage');
    await this.runCoverageForCategory('Security Tests', 'npm run test:security -- --coverage');

    // Generate combined report
    this.generateCombinedReport();
    this.generateHTMLReport();
  }

  private async runCoverageForCategory(category: string, command: string): Promise<void> {
    console.log(`📋 Running coverage for ${category}...`);
    
    try {
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 300000
      });
      
      const coverage = this.parseCoverageOutput(output);
      if (coverage) {
        this.coverageData.push({
          category,
          ...coverage
        });
        console.log(`✅ ${category} coverage collected`);
      }
      
    } catch (error: any) {
      console.log(`⚠️  ${category} coverage collection failed:`, error.message);
    }
  }

  private parseCoverageOutput(output: string): Omit<CoverageData, 'category'> | null {
    // Parse vitest coverage output
    const coverageMatch = output.match(/All files\s+\|\s+(\d+\.?\d*)\s+\|\s+(\d+\.?\d*)\s+\|\s+(\d+\.?\d*)\s+\|\s+(\d+\.?\d*)/);
    
    if (!coverageMatch) return null;

    // Extract uncovered lines (simplified)
    const uncoveredLines: string[] = [];
    const uncoveredMatch = output.match(/Uncovered Line #s\s+:\s+(.+)/g);
    if (uncoveredMatch) {
      uncoveredMatch.forEach(match => {
        const lines = match.replace('Uncovered Line #s : ', '').trim();
        uncoveredLines.push(lines);
      });
    }

    return {
      statements: parseFloat(coverageMatch[1]),
      branches: parseFloat(coverageMatch[2]),
      functions: parseFloat(coverageMatch[3]),
      lines: parseFloat(coverageMatch[4]),
      uncoveredLines
    };
  }

  private generateCombinedReport(): void {
    const reportDir = path.join(process.cwd(), 'coverage-reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Calculate overall coverage
    const overallCoverage = this.calculateOverallCoverage();
    
    const report = {
      timestamp: new Date().toISOString(),
      overallCoverage,
      categoryBreakdown: this.coverageData,
      summary: {
        totalCategories: this.coverageData.length,
        averageStatements: overallCoverage.statements,
        averageBranches: overallCoverage.branches,
        averageFunctions: overallCoverage.functions,
        averageLines: overallCoverage.lines,
        coverageThresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80
        },
        thresholdsMet: {
          statements: overallCoverage.statements >= 80,
          branches: overallCoverage.branches >= 80,
          functions: overallCoverage.functions >= 80,
          lines: overallCoverage.lines >= 80
        }
      }
    };

    const reportPath = path.join(reportDir, `coverage-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n📊 COVERAGE REPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`Overall Statements Coverage: ${overallCoverage.statements.toFixed(1)}%`);
    console.log(`Overall Branches Coverage: ${overallCoverage.branches.toFixed(1)}%`);
    console.log(`Overall Functions Coverage: ${overallCoverage.functions.toFixed(1)}%`);
    console.log(`Overall Lines Coverage: ${overallCoverage.lines.toFixed(1)}%`);

    console.log('\nCategory Breakdown:');
    console.log('-'.repeat(50));
    this.coverageData.forEach(data => {
      console.log(`${data.category}:`);
      console.log(`  Statements: ${data.statements.toFixed(1)}%`);
      console.log(`  Branches: ${data.branches.toFixed(1)}%`);
      console.log(`  Functions: ${data.functions.toFixed(1)}%`);
      console.log(`  Lines: ${data.lines.toFixed(1)}%`);
      console.log('');
    });

    console.log(`📄 Detailed report saved to: ${reportPath}`);

    // Check if thresholds are met
    const thresholdsMet = report.summary.thresholdsMet;
    const allThresholdsMet = Object.values(thresholdsMet).every(met => met);
    
    if (allThresholdsMet) {
      console.log('✅ All coverage thresholds met!');
    } else {
      console.log('⚠️  Some coverage thresholds not met:');
      Object.entries(thresholdsMet).forEach(([metric, met]) => {
        if (!met) {
          console.log(`  - ${metric}: ${overallCoverage[metric as keyof typeof overallCoverage].toFixed(1)}% (threshold: 80%)`);
        }
      });
    }
  }

  private calculateOverallCoverage() {
    if (this.coverageData.length === 0) {
      return { statements: 0, branches: 0, functions: 0, lines: 0 };
    }

    const totals = this.coverageData.reduce((acc, data) => ({
      statements: acc.statements + data.statements,
      branches: acc.branches + data.branches,
      functions: acc.functions + data.functions,
      lines: acc.lines + data.lines
    }), { statements: 0, branches: 0, functions: 0, lines: 0 });

    const count = this.coverageData.length;
    return {
      statements: totals.statements / count,
      branches: totals.branches / count,
      functions: totals.functions / count,
      lines: totals.lines / count
    };
  }

  private generateHTMLReport(): void {
    const reportDir = path.join(process.cwd(), 'coverage-reports');
    const htmlPath = path.join(reportDir, 'coverage-report.html');
    
    const overallCoverage = this.calculateOverallCoverage();
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CAD AI Platform - Coverage Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; margin-top: 5px; }
        .category { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .category-header { background: #007bff; color: white; padding: 15px; font-weight: bold; }
        .category-content { padding: 15px; }
        .coverage-bar { background: #e9ecef; height: 20px; border-radius: 10px; overflow: hidden; margin: 5px 0; }
        .coverage-fill { height: 100%; background: linear-gradient(90deg, #28a745, #ffc107, #dc3545); transition: width 0.3s ease; }
        .good { background: #28a745 !important; }
        .warning { background: #ffc107 !important; }
        .danger { background: #dc3545 !important; }
        .timestamp { text-align: center; color: #666; margin-top: 20px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>CAD AI Platform - Test Coverage Report</h1>
            <p>Comprehensive coverage analysis across all test categories</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <div class="metric-value">${overallCoverage.statements.toFixed(1)}%</div>
                <div class="metric-label">Statements</div>
            </div>
            <div class="metric">
                <div class="metric-value">${overallCoverage.branches.toFixed(1)}%</div>
                <div class="metric-label">Branches</div>
            </div>
            <div class="metric">
                <div class="metric-value">${overallCoverage.functions.toFixed(1)}%</div>
                <div class="metric-label">Functions</div>
            </div>
            <div class="metric">
                <div class="metric-value">${overallCoverage.lines.toFixed(1)}%</div>
                <div class="metric-label">Lines</div>
            </div>
        </div>
        
        <h2>Category Breakdown</h2>
        ${this.coverageData.map(data => `
        <div class="category">
            <div class="category-header">${data.category}</div>
            <div class="category-content">
                <div>
                    <strong>Statements:</strong> ${data.statements.toFixed(1)}%
                    <div class="coverage-bar">
                        <div class="coverage-fill ${this.getCoverageClass(data.statements)}" style="width: ${data.statements}%"></div>
                    </div>
                </div>
                <div>
                    <strong>Branches:</strong> ${data.branches.toFixed(1)}%
                    <div class="coverage-bar">
                        <div class="coverage-fill ${this.getCoverageClass(data.branches)}" style="width: ${data.branches}%"></div>
                    </div>
                </div>
                <div>
                    <strong>Functions:</strong> ${data.functions.toFixed(1)}%
                    <div class="coverage-bar">
                        <div class="coverage-fill ${this.getCoverageClass(data.functions)}" style="width: ${data.functions}%"></div>
                    </div>
                </div>
                <div>
                    <strong>Lines:</strong> ${data.lines.toFixed(1)}%
                    <div class="coverage-bar">
                        <div class="coverage-fill ${this.getCoverageClass(data.lines)}" style="width: ${data.lines}%"></div>
                    </div>
                </div>
            </div>
        </div>
        `).join('')}
        
        <div class="timestamp">
            Generated on: ${new Date().toLocaleString()}
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync(htmlPath, html);
    console.log(`🌐 HTML report generated: ${htmlPath}`);
  }

  private getCoverageClass(percentage: number): string {
    if (percentage >= 80) return 'good';
    if (percentage >= 60) return 'warning';
    return 'danger';
  }
}

// Run the coverage report generator
if (require.main === module) {
  const generator = new CoverageReportGenerator();
  generator.generateComprehensiveCoverage().catch(error => {
    console.error('❌ Coverage report generation failed:', error);
    process.exit(1);
  });
}

export { CoverageReportGenerator };