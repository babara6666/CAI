#!/usr/bin/env tsx

/**
 * Comprehensive test runner script
 * Runs all test categories and generates reports
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface TestResult {
  category: string;
  passed: boolean;
  duration: number;
  coverage?: number;
  errors?: string[];
}

class ComprehensiveTestRunner {
  private results: TestResult[] = [];
  private startTime = Date.now();

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Comprehensive Test Suite...\n');

    // Run each test category
    await this.runTestCategory('Unit Tests', 'npm run test:unit');
    await this.runTestCategory('Integration Tests', 'npm run test:integration');
    await this.runTestCategory('Security Tests', 'npm run test:security');
    await this.runTestCategory('Performance Tests', 'npm run test:performance');
    
    // Generate final report
    this.generateReport();
  }

  private async runTestCategory(category: string, command: string): Promise<void> {
    console.log(`📋 Running ${category}...`);
    const startTime = Date.now();
    
    try {
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 300000 // 5 minutes timeout
      });
      
      const duration = Date.now() - startTime;
      const coverage = this.extractCoverage(output);
      
      this.results.push({
        category,
        passed: true,
        duration,
        coverage
      });
      
      console.log(`✅ ${category} passed in ${duration}ms`);
      if (coverage) {
        console.log(`📊 Coverage: ${coverage}%`);
      }
      console.log('');
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errors = this.extractErrors(error.stdout || error.message);
      
      this.results.push({
        category,
        passed: false,
        duration,
        errors
      });
      
      console.log(`❌ ${category} failed in ${duration}ms`);
      console.log(`Errors: ${errors.join(', ')}`);
      console.log('');
    }
  }

  private extractCoverage(output: string): number | undefined {
    const coverageMatch = output.match(/All files\s+\|\s+(\d+\.?\d*)/);
    return coverageMatch ? parseFloat(coverageMatch[1]) : undefined;
  }

  private extractErrors(output: string): string[] {
    const errors: string[] = [];
    
    // Extract common error patterns
    const errorPatterns = [
      /Error: (.+)/g,
      /TypeError: (.+)/g,
      /ReferenceError: (.+)/g,
      /FAIL (.+)/g
    ];
    
    errorPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        errors.push(match[1].trim());
      }
    });
    
    return errors.slice(0, 5); // Limit to first 5 errors
  }

  private generateReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.results.filter(r => r.passed).length;
    const totalTests = this.results.length;
    const overallCoverage = this.calculateOverallCoverage();
    
    console.log('📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(50));
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Tests Passed: ${passedTests}/${totalTests}`);
    console.log(`Overall Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (overallCoverage) {
      console.log(`Overall Coverage: ${overallCoverage.toFixed(1)}%`);
    }
    
    console.log('\nDetailed Results:');
    console.log('-'.repeat(50));
    
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const coverage = result.coverage ? ` (${result.coverage}% coverage)` : '';
      console.log(`${status} ${result.category}: ${result.duration}ms${coverage}`);
      
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(`   - ${error}`);
        });
      }
    });
    
    // Save report to file
    this.saveReportToFile();
    
    // Exit with appropriate code
    const allPassed = this.results.every(r => r.passed);
    if (!allPassed) {
      console.log('\n❌ Some tests failed. Check the details above.');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed successfully!');
    }
  }

  private calculateOverallCoverage(): number | undefined {
    const coverageResults = this.results
      .filter(r => r.coverage !== undefined)
      .map(r => r.coverage!);
    
    if (coverageResults.length === 0) return undefined;
    
    return coverageResults.reduce((sum, coverage) => sum + coverage, 0) / coverageResults.length;
  }

  private saveReportToFile(): void {
    const reportDir = path.join(process.cwd(), 'test-reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportPath = path.join(reportDir, `comprehensive-test-report-${Date.now()}.json`);
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: Date.now() - this.startTime,
      results: this.results,
      summary: {
        totalTests: this.results.length,
        passedTests: this.results.filter(r => r.passed).length,
        overallCoverage: this.calculateOverallCoverage()
      }
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }
}

// Run the comprehensive test suite
if (require.main === module) {
  const runner = new ComprehensiveTestRunner();
  runner.runAllTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { ComprehensiveTestRunner };