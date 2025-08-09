import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 20 }, // Ramp up to 20 users
    { duration: '5m', target: 20 }, // Stay at 20 users
    { duration: '2m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    http_req_failed: ['rate<0.1'],     // Error rate should be below 10%
    errors: ['rate<0.1'],              // Custom error rate should be below 10%
  },
};

// Base URL
const BASE_URL = 'http://localhost:5000';

// Test data
let authToken = '';

export function setup() {
  // Login to get authentication token
  const loginResponse = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'test@example.com',
    password: 'TestPassword123!'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginResponse.status === 200) {
    const loginData = JSON.parse(loginResponse.body);
    return { authToken: loginData.token };
  }
  
  console.error('Failed to authenticate during setup');
  return { authToken: '' };
}

export default function(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Test 1: Health check
  const healthResponse = http.get(`${BASE_URL}/health`);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);

  // Test 2: Get files list
  const filesResponse = http.get(`${BASE_URL}/api/files`, { headers });
  check(filesResponse, {
    'files list status is 200': (r) => r.status === 200,
    'files list response time < 1000ms': (r) => r.timings.duration < 1000,
    'files list returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.files);
      } catch (e) {
        return false;
      }
    },
  }) || errorRate.add(1);

  sleep(1);

  // Test 3: Search query
  const searchPayload = JSON.stringify({
    query: 'mechanical parts',
    filters: {
      tags: ['mechanical']
    }
  });

  const searchResponse = http.post(`${BASE_URL}/api/search/query`, searchPayload, { headers });
  check(searchResponse, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 2000ms': (r) => r.timings.duration < 2000,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.results);
      } catch (e) {
        return false;
      }
    },
  }) || errorRate.add(1);

  sleep(1);

  // Test 4: Get user profile
  const profileResponse = http.get(`${BASE_URL}/api/auth/profile`, { headers });
  check(profileResponse, {
    'profile status is 200': (r) => r.status === 200,
    'profile response time < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  sleep(1);

  // Test 5: Get AI models
  const modelsResponse = http.get(`${BASE_URL}/api/ai/models`, { headers });
  check(modelsResponse, {
    'models status is 200': (r) => r.status === 200,
    'models response time < 1000ms': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(1);

  // Test 6: Get datasets
  const datasetsResponse = http.get(`${BASE_URL}/api/ai/datasets`, { headers });
  check(datasetsResponse, {
    'datasets status is 200': (r) => r.status === 200,
    'datasets response time < 1000ms': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(2);
}

export function teardown(data) {
  // Logout
  if (data.authToken) {
    http.post(`${BASE_URL}/api/auth/logout`, null, {
      headers: { 'Authorization': `Bearer ${data.authToken}` },
    });
  }
}