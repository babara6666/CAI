#!/usr/bin/env node

/**
 * System Integration Validation Script
 * This script performs comprehensive validation of the CAD AI Platform integration
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Configuration
const BASE_URL = 'http://localhost:5000';
const AI_SERVICE_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:3000';

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Utility functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName, status, details = '') {
  totalTests++;
  
  if (status === 'PASS') {
    passedTests++;
    log(`✓ ${testName}`, 'green');
  } else {
    failedTests++;
    log(`✗ ${testName}`, 'red');
    if (details) {
      log(`  Error: ${details}`, 'red');
    }
  }
  
  testResults.push({ test: testName, status, details });
}

// Authentication helper
async function authenticate() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'test@example.com',
      password: 'TestPassword123!'
    });
    
    return response.data.token;
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

// Test functions
async function testServiceHealth() {
  log('\n🏥 Testing Service Health', 'blue');
  
  // Test Backend Health
  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    if (response.status === 200 && response.data.status === 'healthy') {
      logTest('Backend Health Check', 'PASS');
    } else {
      logTest('Backend Health Check', 'FAIL', 'Unhealthy status');
    }
  } catch (error) {
    logTest('Backend Health Check', 'FAIL', error.message);
  }
  
  // Test AI Service Health
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 5000 });
    if (response.status === 200) {
      logTest('AI Service Health Check', 'PASS');
    } else {
      logTest('AI Service Health Check', 'FAIL', 'Service not responding');
    }
  } catch (error) {
    logTest('AI Service Health Check', 'FAIL', error.message);
  }
  
  // Test Frontend Availability
  try {
    const response = await axios.get(FRONTEND_URL, { timeout: 5000 });
    if (response.status === 200) {
      logTest('Frontend Availability', 'PASS');
    } else {
      logTest('Frontend Availability', 'FAIL', 'Frontend not accessible');
    }
  } catch (error) {
    logTest('Frontend Availability', 'FAIL', error.message);
  }
}

async function testAuthenticationFlow(token) {
  log('\n🔐 Testing Authentication Flow', 'blue');
  
  // Test token validation
  try {
    const response = await axios.get(`${BASE_URL}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.status === 200 && response.data.user) {
      logTest('Token Validation', 'PASS');
    } else {
      logTest('Token Validation', 'FAIL', 'Invalid token response');
    }
  } catch (error) {
    logTest('Token Validation', 'FAIL', error.message);
  }
  
  // Test unauthorized access
  try {
    const response = await axios.get(`${BASE_URL}/api/files`);
    logTest('Unauthorized Access Prevention', 'FAIL', 'Unauthorized access allowed');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      logTest('Unauthorized Access Prevention', 'PASS');
    } else {
      logTest('Unauthorized Access Prevention', 'FAIL', error.message);
    }
  }
}

async function testFileManagement(token) {
  log('\n📁 Testing File Management', 'blue');
  
  const headers = { Authorization: `Bearer ${token}` };
  
  // Test file upload
  try {
    const testFileContent = 'Mock CAD file content for integration testing';
    const form = new FormData();
    form.append('files', Buffer.from(testFileContent), {
      filename: 'integration-test.dwg',
      contentType: 'application/octet-stream'
    });
    form.append('projectName', 'Integration Test Project');
    form.append('tags', 'integration,test,validation');
    form.append('description', 'File uploaded during integration validation');
    
    const response = await axios.post(`${BASE_URL}/api/files/upload`, form, {
      headers: {
        ...headers,
        ...form.getHeaders()
      }
    });
    
    if (response.status === 200 && response.data.success && response.data.files.length > 0) {
      logTest('File Upload', 'PASS');
      
      const fileId = response.data.files[0].id;
      
      // Test file retrieval
      try {
        const fileResponse = await axios.get(`${BASE_URL}/api/files/${fileId}`, { headers });
        if (fileResponse.status === 200 && fileResponse.data.file) {
          logTest('File Retrieval', 'PASS');
        } else {
          logTest('File Retrieval', 'FAIL', 'File not found');
        }
      } catch (error) {
        logTest('File Retrieval', 'FAIL', error.message);
      }
      
      // Test file list
      try {
        const listResponse = await axios.get(`${BASE_URL}/api/files`, { headers });
        if (listResponse.status === 200 && Array.isArray(listResponse.data.files)) {
          logTest('File List', 'PASS');
        } else {
          logTest('File List', 'FAIL', 'Invalid file list response');
        }
      } catch (error) {
        logTest('File List', 'FAIL', error.message);
      }
      
    } else {
      logTest('File Upload', 'FAIL', 'Upload failed');
    }
  } catch (error) {
    logTest('File Upload', 'FAIL', error.message);
  }
}

async function testSearchFunctionality(token) {
  log('\n🔍 Testing Search Functionality', 'blue');
  
  const headers = { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // Test basic search
  try {
    const searchData = {
      query: 'integration test files',
      filters: {
        tags: ['integration']
      }
    };
    
    const response = await axios.post(`${BASE_URL}/api/search/query`, searchData, { headers });
    
    if (response.status === 200 && response.data.results !== undefined) {
      logTest('Basic Search', 'PASS');
      
      // Test search suggestions
      try {
        const suggestionsResponse = await axios.get(
          `${BASE_URL}/api/search/suggestions?partial=integration`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (suggestionsResponse.status === 200 && Array.isArray(suggestionsResponse.data.suggestions)) {
          logTest('Search Suggestions', 'PASS');
        } else {
          logTest('Search Suggestions', 'FAIL', 'Invalid suggestions response');
        }
      } catch (error) {
        logTest('Search Suggestions', 'FAIL', error.message);
      }
      
    } else {
      logTest('Basic Search', 'FAIL', 'Invalid search response');
    }
  } catch (error) {
    logTest('Basic Search', 'FAIL', error.message);
  }
}

async function testAIServiceIntegration(token) {
  log('\n🤖 Testing AI Service Integration', 'blue');
  
  const headers = { 
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  
  // Test dataset creation
  try {
    const datasetData = {
      name: 'Integration Test Dataset',
      description: 'Dataset created during integration validation',
      files: ['test-file-1', 'test-file-2'],
      labels: ['test', 'integration']
    };
    
    const response = await axios.post(`${BASE_URL}/api/ai/datasets`, datasetData, { headers });
    
    if (response.status === 200 && response.data.dataset) {
      logTest('Dataset Creation', 'PASS');
      
      const datasetId = response.data.dataset.id;
      
      // Test dataset retrieval
      try {
        const datasetResponse = await axios.get(`${BASE_URL}/api/ai/datasets/${datasetId}`, { headers });
        if (datasetResponse.status === 200) {
          logTest('Dataset Retrieval', 'PASS');
        } else {
          logTest('Dataset Retrieval', 'FAIL', 'Dataset not found');
        }
      } catch (error) {
        logTest('Dataset Retrieval', 'FAIL', error.message);
      }
      
    } else {
      logTest('Dataset Creation', 'FAIL', 'Dataset creation failed');
    }
  } catch (error) {
    logTest('Dataset Creation', 'FAIL', error.message);
  }
  
  // Test model listing
  try {
    const response = await axios.get(`${BASE_URL}/api/ai/models`, { headers });
    if (response.status === 200 && Array.isArray(response.data.models)) {
      logTest('Model Listing', 'PASS');
    } else {
      logTest('Model Listing', 'FAIL', 'Invalid models response');
    }
  } catch (error) {
    logTest('Model Listing', 'FAIL', error.message);
  }
}

async function testDatabaseIntegration() {
  log('\n🗄️ Testing Database Integration', 'blue');
  
  // Test database connectivity through API
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.data.services && response.data.services.database === 'healthy') {
      logTest('Database Connectivity', 'PASS');
    } else {
      logTest('Database Connectivity', 'FAIL', 'Database not healthy');
    }
  } catch (error) {
    logTest('Database Connectivity', 'FAIL', error.message);
  }
}

async function testCacheIntegration() {
  log('\n⚡ Testing Cache Integration', 'blue');
  
  // Test cache through API health check
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.data.services && response.data.services.cache === 'healthy') {
      logTest('Cache Connectivity', 'PASS');
    } else {
      logTest('Cache Connectivity', 'FAIL', 'Cache not healthy');
    }
  } catch (error) {
    logTest('Cache Connectivity', 'FAIL', error.message);
  }
}

async function testAPIEndpoints(token) {
  log('\n🌐 Testing API Endpoints', 'blue');
  
  const headers = { Authorization: `Bearer ${token}` };
  
  // Test various API endpoints
  const endpoints = [
    { method: 'GET', path: '/api/files', name: 'Files API' },
    { method: 'GET', path: '/api/ai/datasets', name: 'Datasets API' },
    { method: 'GET', path: '/api/ai/models', name: 'Models API' },
    { method: 'GET', path: '/api/search/history', name: 'Search History API' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios({
        method: endpoint.method.toLowerCase(),
        url: `${BASE_URL}${endpoint.path}`,
        headers
      });
      
      if (response.status === 200) {
        logTest(endpoint.name, 'PASS');
      } else {
        logTest(endpoint.name, 'FAIL', `Status: ${response.status}`);
      }
    } catch (error) {
      logTest(endpoint.name, 'FAIL', error.message);
    }
  }
}

async function testErrorHandling(token) {
  log('\n🚨 Testing Error Handling', 'blue');
  
  // Test invalid endpoint
  try {
    await axios.get(`${BASE_URL}/api/invalid-endpoint`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    logTest('Invalid Endpoint Handling', 'FAIL', 'Should return 404');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      logTest('Invalid Endpoint Handling', 'PASS');
    } else {
      logTest('Invalid Endpoint Handling', 'FAIL', error.message);
    }
  }
  
  // Test invalid data
  try {
    await axios.post(`${BASE_URL}/api/search/query`, { invalid: 'data' }, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    logTest('Invalid Data Handling', 'FAIL', 'Should return validation error');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      logTest('Invalid Data Handling', 'PASS');
    } else {
      logTest('Invalid Data Handling', 'FAIL', error.message);
    }
  }
}

async function testPerformance(token) {
  log('\n⚡ Testing Performance', 'blue');
  
  const headers = { Authorization: `Bearer ${token}` };
  
  // Test response times
  const performanceTests = [
    { name: 'Health Check Response Time', url: `${BASE_URL}/health`, maxTime: 1000 },
    { name: 'File List Response Time', url: `${BASE_URL}/api/files`, maxTime: 2000 },
    { name: 'Search Response Time', url: `${BASE_URL}/api/search/suggestions?partial=test`, maxTime: 3000 }
  ];
  
  for (const test of performanceTests) {
    try {
      const startTime = Date.now();
      const response = await axios.get(test.url, { headers });
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200 && responseTime < test.maxTime) {
        logTest(`${test.name} (${responseTime}ms)`, 'PASS');
      } else {
        logTest(`${test.name} (${responseTime}ms)`, 'FAIL', `Exceeded ${test.maxTime}ms threshold`);
      }
    } catch (error) {
      logTest(test.name, 'FAIL', error.message);
    }
  }
}

function generateReport() {
  log('\n📊 Generating Integration Test Report', 'blue');
  
  const successRate = Math.round((passedTests / totalTests) * 100);
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      successRate: successRate
    },
    results: testResults
  };
  
  // Save report to file
  fs.writeFileSync('integration-validation-report.json', JSON.stringify(report, null, 2));
  
  // Display summary
  log('\n====================================================', 'cyan');
  log('SYSTEM INTEGRATION VALIDATION RESULTS', 'cyan');
  log('====================================================', 'cyan');
  log(`Total Tests: ${totalTests}`, 'blue');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, 'red');
  log(`Success Rate: ${successRate}%`, successRate >= 90 ? 'green' : 'red');
  
  if (failedTests === 0) {
    log('\n🎉 ALL INTEGRATION TESTS PASSED!', 'green');
    log('✅ The CAD AI Platform is fully integrated and ready for deployment', 'green');
  } else {
    log('\n❌ SOME INTEGRATION TESTS FAILED', 'red');
    log('Please review the failed tests and fix the issues before deployment', 'red');
  }
  
  log(`\nDetailed report saved to: integration-validation-report.json`, 'blue');
  
  return failedTests === 0;
}

// Main execution
async function main() {
  log('🚀 Starting CAD AI Platform Integration Validation', 'cyan');
  log('==================================================', 'cyan');
  
  try {
    // Wait for services to be ready
    log('\n⏳ Waiting for services to be ready...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Authenticate
    log('\n🔑 Authenticating...', 'blue');
    const token = await authenticate();
    log('Authentication successful', 'green');
    
    // Run all tests
    await testServiceHealth();
    await testAuthenticationFlow(token);
    await testFileManagement(token);
    await testSearchFunctionality(token);
    await testAIServiceIntegration(token);
    await testDatabaseIntegration();
    await testCacheIntegration();
    await testAPIEndpoints(token);
    await testErrorHandling(token);
    await testPerformance(token);
    
    // Generate report
    const success = generateReport();
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    log(`\n❌ Integration validation failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  testServiceHealth,
  testAuthenticationFlow,
  testFileManagement,
  testSearchFunctionality,
  testAIServiceIntegration
};