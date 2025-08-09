#!/usr/bin/env tsx

/**
 * Security Vulnerability Assessment Script
 * 
 * This script performs automated security checks on the CAD AI Platform
 * to identify potential vulnerabilities and security misconfigurations.
 */

import { DatabaseService } from '../database/DatabaseService.js';
import { EncryptionService } from '../config/encryption.js';
import { SecurityEventService } from '../services/SecurityEventService.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  cve?: string;
  references?: string[];
}

interface AssessmentReport {
  timestamp: Date;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
  };
  issues: SecurityIssue[];
  recommendations: string[];
}

class SecurityAssessment {
  private issues: SecurityIssue[] = [];

  /**
   * Run comprehensive security assessment
   */
  async runAssessment(): Promise<AssessmentReport> {
    console.log('🔍 Starting Security Vulnerability Assessment...\n');

    try {
      // Environment and configuration checks
      await this.checkEnvironmentSecurity();
      
      // Database security checks
      await this.checkDatabaseSecurity();
      
      // Encryption and cryptography checks
      await this.checkEncryptionSecurity();
      
      // File system security checks
      await this.checkFileSystemSecurity();
      
      // Dependency security checks
      await this.checkDependencySecurity();
      
      // API security checks
      await this.checkApiSecurity();
      
      // Authentication and authorization checks
      await this.checkAuthSecurity();

      // Generate report
      const report = this.generateReport();
      
      // Save report
      await this.saveReport(report);
      
      console.log('\n✅ Security assessment completed!');
      console.log(`📊 Found ${report.summary.totalIssues} security issues`);
      console.log(`🚨 Critical: ${report.summary.criticalIssues}, High: ${report.summary.highIssues}, Medium: ${report.summary.mediumIssues}, Low: ${report.summary.lowIssues}`);
      
      return report;
    } catch (error) {
      console.error('❌ Security assessment failed:', error);
      throw error;
    }
  }

  /**
   * Check environment and configuration security
   */
  private async checkEnvironmentSecurity(): Promise<void> {
    console.log('🔧 Checking environment security...');

    // Check for required environment variables
    const requiredEnvVars = [
      'JWT_SECRET',
      'ENCRYPTION_MASTER_KEY',
      'DATABASE_URL',
      'REDIS_URL'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        this.addIssue({
          severity: 'critical',
          category: 'Configuration',
          title: `Missing required environment variable: ${envVar}`,
          description: `The environment variable ${envVar} is not set, which could lead to security vulnerabilities.`,
          recommendation: `Set the ${envVar} environment variable with a secure value.`
        });
      }
    }

    // Check JWT secret strength
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length < 32) {
      this.addIssue({
        severity: 'high',
        category: 'Configuration',
        title: 'Weak JWT secret',
        description: 'JWT secret is too short and may be vulnerable to brute force attacks.',
        recommendation: 'Use a JWT secret that is at least 32 characters long with high entropy.'
      });
    }

    // Check if running in production mode
    if (process.env.NODE_ENV !== 'production') {
      this.addIssue({
        severity: 'medium',
        category: 'Configuration',
        title: 'Not running in production mode',
        description: 'Application is not running in production mode, which may expose debug information.',
        recommendation: 'Set NODE_ENV=production in production environments.'
      });
    }

    // Check for debug flags
    if (process.env.DEBUG) {
      this.addIssue({
        severity: 'medium',
        category: 'Configuration',
        title: 'Debug mode enabled',
        description: 'Debug mode is enabled, which may expose sensitive information.',
        recommendation: 'Disable debug mode in production by removing the DEBUG environment variable.'
      });
    }
  }

  /**
   * Check database security configuration
   */
  private async checkDatabaseSecurity(): Promise<void> {
    console.log('🗄️ Checking database security...');

    try {
      const db = DatabaseService.getInstance();

      // Check for default passwords
      const defaultPasswords = ['postgres', 'password', '123456', 'admin'];
      const dbUrl = process.env.DATABASE_URL || '';
      
      for (const defaultPass of defaultPasswords) {
        if (dbUrl.includes(defaultPass)) {
          this.addIssue({
            severity: 'critical',
            category: 'Database',
            title: 'Default database password detected',
            description: 'Database is using a default or weak password.',
            recommendation: 'Change the database password to a strong, unique password.'
          });
          break;
        }
      }

      // Check database connection encryption
      if (!dbUrl.includes('sslmode=require') && !dbUrl.includes('ssl=true')) {
        this.addIssue({
          severity: 'high',
          category: 'Database',
          title: 'Database connection not encrypted',
          description: 'Database connection is not using SSL/TLS encryption.',
          recommendation: 'Enable SSL/TLS encryption for database connections.'
        });
      }

      // Check for sensitive data in plain text
      const sensitiveDataCheck = await db.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE column_name ILIKE '%password%'
        OR column_name ILIKE '%secret%'
        OR column_name ILIKE '%token%'
        OR column_name ILIKE '%key%'
      `);

      if (sensitiveDataCheck.rows.length > 0) {
        this.addIssue({
          severity: 'medium',
          category: 'Database',
          title: 'Potentially sensitive columns detected',
          description: 'Database contains columns that may store sensitive data without encryption.',
          recommendation: 'Review sensitive columns and ensure they are properly encrypted.'
        });
      }

      // Check for pgcrypto extension
      const cryptoExtension = await db.query(`
        SELECT * FROM pg_extension WHERE extname = 'pgcrypto'
      `);

      if (cryptoExtension.rows.length === 0) {
        this.addIssue({
          severity: 'medium',
          category: 'Database',
          title: 'pgcrypto extension not installed',
          description: 'PostgreSQL pgcrypto extension is not installed, limiting encryption capabilities.',
          recommendation: 'Install the pgcrypto extension for enhanced database encryption features.'
        });
      }

    } catch (error) {
      this.addIssue({
        severity: 'high',
        category: 'Database',
        title: 'Database security check failed',
        description: `Unable to perform database security checks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Investigate database connectivity and permissions.'
      });
    }
  }

  /**
   * Check encryption and cryptography security
   */
  private async checkEncryptionSecurity(): Promise<void> {
    console.log('🔐 Checking encryption security...');

    try {
      // Check encryption key strength
      const masterKey = process.env.ENCRYPTION_MASTER_KEY;
      if (masterKey && masterKey.length < 32) {
        this.addIssue({
          severity: 'critical',
          category: 'Encryption',
          title: 'Weak encryption master key',
          description: 'Encryption master key is too short and may be vulnerable to attacks.',
          recommendation: 'Use an encryption master key that is at least 32 characters long with high entropy.'
        });
      }

      // Test encryption functionality
      try {
        EncryptionService.initialize();
        const testData = 'security test data';
        const encrypted = EncryptionService.encrypt(testData);
        const decrypted = EncryptionService.decrypt(encrypted);
        
        if (decrypted !== testData) {
          this.addIssue({
            severity: 'critical',
            category: 'Encryption',
            title: 'Encryption/decryption failure',
            description: 'Encryption service is not working correctly.',
            recommendation: 'Review encryption configuration and implementation.'
          });
        }
      } catch (error) {
        this.addIssue({
          severity: 'critical',
          category: 'Encryption',
          title: 'Encryption service initialization failed',
          description: `Encryption service failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`,
          recommendation: 'Check encryption configuration and environment variables.'
        });
      }

      // Check for hardcoded secrets in code
      await this.checkForHardcodedSecrets();

    } catch (error) {
      this.addIssue({
        severity: 'high',
        category: 'Encryption',
        title: 'Encryption security check failed',
        description: `Unable to perform encryption security checks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Review encryption implementation and configuration.'
      });
    }
  }

  /**
   * Check file system security
   */
  private async checkFileSystemSecurity(): Promise<void> {
    console.log('📁 Checking file system security...');

    try {
      // Check for sensitive files with weak permissions
      const sensitiveFiles = [
        '.env',
        '.env.local',
        '.env.production',
        'config/database.yml',
        'config/secrets.yml'
      ];

      for (const file of sensitiveFiles) {
        try {
          const stats = await fs.stat(file);
          const mode = stats.mode & parseInt('777', 8);
          
          // Check if file is readable by others (world-readable)
          if (mode & parseInt('044', 8)) {
            this.addIssue({
              severity: 'high',
              category: 'File System',
              title: `Sensitive file has weak permissions: ${file}`,
              description: `File ${file} is readable by other users, potentially exposing sensitive information.`,
              recommendation: `Change file permissions to 600 (owner read/write only): chmod 600 ${file}`
            });
          }
        } catch (error) {
          // File doesn't exist, which is fine
        }
      }

      // Check for backup files that might contain sensitive data
      const backupPatterns = ['*.bak', '*.backup', '*.old', '*.tmp', '*~'];
      // This would require a more sophisticated file search in a real implementation

    } catch (error) {
      this.addIssue({
        severity: 'medium',
        category: 'File System',
        title: 'File system security check failed',
        description: `Unable to perform file system security checks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Manually review file system permissions and sensitive file locations.'
      });
    }
  }

  /**
   * Check dependency security
   */
  private async checkDependencySecurity(): Promise<void> {
    console.log('📦 Checking dependency security...');

    try {
      // Read package.json to check for known vulnerable packages
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      // Known vulnerable packages (this would be updated from a vulnerability database)
      const knownVulnerablePackages = [
        { name: 'lodash', version: '<4.17.21', cve: 'CVE-2021-23337' },
        { name: 'axios', version: '<0.21.2', cve: 'CVE-2021-3749' },
        { name: 'jsonwebtoken', version: '<8.5.1', cve: 'CVE-2022-23529' }
      ];

      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const vuln of knownVulnerablePackages) {
        if (dependencies[vuln.name]) {
          this.addIssue({
            severity: 'high',
            category: 'Dependencies',
            title: `Potentially vulnerable dependency: ${vuln.name}`,
            description: `Package ${vuln.name} may be vulnerable to ${vuln.cve}.`,
            recommendation: `Update ${vuln.name} to version ${vuln.version.replace('<', '>=')} or later.`,
            cve: vuln.cve
          });
        }
      }

      // Check for packages with known security issues
      const securitySensitivePackages = ['eval', 'vm2', 'serialize-javascript'];
      for (const pkg of securitySensitivePackages) {
        if (dependencies[pkg]) {
          this.addIssue({
            severity: 'medium',
            category: 'Dependencies',
            title: `Security-sensitive package detected: ${pkg}`,
            description: `Package ${pkg} has known security implications and should be used carefully.`,
            recommendation: `Review usage of ${pkg} and consider alternatives if possible.`
          });
        }
      }

    } catch (error) {
      this.addIssue({
        severity: 'medium',
        category: 'Dependencies',
        title: 'Dependency security check failed',
        description: `Unable to perform dependency security checks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Run npm audit or yarn audit to check for known vulnerabilities.'
      });
    }
  }

  /**
   * Check API security configuration
   */
  private async checkApiSecurity(): Promise<void> {
    console.log('🌐 Checking API security...');

    // Check CORS configuration
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl || frontendUrl === '*') {
      this.addIssue({
        severity: 'high',
        category: 'API Security',
        title: 'Insecure CORS configuration',
        description: 'CORS is configured to allow all origins or is not properly configured.',
        recommendation: 'Configure CORS to only allow specific trusted origins.'
      });
    }

    // Check for rate limiting configuration
    if (!process.env.RATE_LIMIT_WINDOW_MS || !process.env.RATE_LIMIT_MAX_REQUESTS) {
      this.addIssue({
        severity: 'medium',
        category: 'API Security',
        title: 'Rate limiting not configured',
        description: 'API rate limiting is not properly configured, making it vulnerable to abuse.',
        recommendation: 'Configure appropriate rate limiting for API endpoints.'
      });
    }

    // Check for API versioning
    this.addIssue({
      severity: 'low',
      category: 'API Security',
      title: 'API versioning recommendation',
      description: 'Ensure API versioning is implemented for backward compatibility and security.',
      recommendation: 'Implement proper API versioning strategy.'
    });
  }

  /**
   * Check authentication and authorization security
   */
  private async checkAuthSecurity(): Promise<void> {
    console.log('🔑 Checking authentication security...');

    // Check JWT configuration
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      // Check for weak JWT secrets
      const commonSecrets = ['secret', 'jwt-secret', 'your-secret-key', '123456'];
      if (commonSecrets.includes(jwtSecret.toLowerCase())) {
        this.addIssue({
          severity: 'critical',
          category: 'Authentication',
          title: 'Weak JWT secret',
          description: 'JWT secret is using a common or default value.',
          recommendation: 'Use a strong, randomly generated JWT secret.'
        });
      }
    }

    // Check for MFA configuration
    if (!process.env.MFA_ENABLED || process.env.MFA_ENABLED !== 'true') {
      this.addIssue({
        severity: 'medium',
        category: 'Authentication',
        title: 'Multi-factor authentication not enabled',
        description: 'MFA is not enabled, reducing account security.',
        recommendation: 'Enable multi-factor authentication for enhanced security.'
      });
    }

    // Check session configuration
    if (!process.env.SESSION_SECRET) {
      this.addIssue({
        severity: 'high',
        category: 'Authentication',
        title: 'Session secret not configured',
        description: 'Session secret is not configured, potentially compromising session security.',
        recommendation: 'Configure a strong session secret.'
      });
    }
  }

  /**
   * Check for hardcoded secrets in source code
   */
  private async checkForHardcodedSecrets(): Promise<void> {
    const secretPatterns = [
      /password\s*=\s*['"][^'"]+['"]/gi,
      /secret\s*=\s*['"][^'"]+['"]/gi,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
      /token\s*=\s*['"][^'"]+['"]/gi,
      /['"]\w*[Pp]assword\w*['"]:\s*['"][^'"]+['"]/gi,
      /['"]\w*[Ss]ecret\w*['"]:\s*['"][^'"]+['"]/gi
    ];

    try {
      // This is a simplified check - in a real implementation, you'd scan all source files
      const sourceFiles = ['src/config/encryption.ts', 'src/services/AuthService.ts'];
      
      for (const file of sourceFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          
          for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
              this.addIssue({
                severity: 'high',
                category: 'Code Security',
                title: `Potential hardcoded secret in ${file}`,
                description: 'Source code may contain hardcoded secrets or passwords.',
                recommendation: 'Move all secrets to environment variables or secure configuration.'
              });
              break;
            }
          }
        } catch (error) {
          // File doesn't exist or can't be read
        }
      }
    } catch (error) {
      // Ignore errors in this check
    }
  }

  /**
   * Add a security issue to the report
   */
  private addIssue(issue: SecurityIssue): void {
    this.issues.push(issue);
  }

  /**
   * Generate the final security assessment report
   */
  private generateReport(): AssessmentReport {
    const summary = {
      totalIssues: this.issues.length,
      criticalIssues: this.issues.filter(i => i.severity === 'critical').length,
      highIssues: this.issues.filter(i => i.severity === 'high').length,
      mediumIssues: this.issues.filter(i => i.severity === 'medium').length,
      lowIssues: this.issues.filter(i => i.severity === 'low').length
    };

    // Determine overall risk level
    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (summary.criticalIssues > 0) {
      overallRisk = 'critical';
    } else if (summary.highIssues > 2) {
      overallRisk = 'high';
    } else if (summary.highIssues > 0 || summary.mediumIssues > 3) {
      overallRisk = 'medium';
    }

    // Generate recommendations
    const recommendations = [
      'Regularly update dependencies to patch known vulnerabilities',
      'Implement comprehensive logging and monitoring',
      'Conduct regular security assessments and penetration testing',
      'Use strong, unique passwords and enable MFA where possible',
      'Keep all systems and software up to date',
      'Implement proper backup and disaster recovery procedures',
      'Train team members on security best practices'
    ];

    return {
      timestamp: new Date(),
      overallRisk,
      summary,
      issues: this.issues.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      }),
      recommendations
    };
  }

  /**
   * Save the security assessment report
   */
  private async saveReport(report: AssessmentReport): Promise<void> {
    const reportDir = path.join(process.cwd(), 'security-reports');
    const reportFile = path.join(reportDir, `security-assessment-${Date.now()}.json`);

    try {
      await fs.mkdir(reportDir, { recursive: true });
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      console.log(`📄 Security report saved to: ${reportFile}`);
    } catch (error) {
      console.error('Failed to save security report:', error);
    }
  }
}

// Run assessment if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const assessment = new SecurityAssessment();
  assessment.runAssessment().catch(console.error);
}

export { SecurityAssessment };