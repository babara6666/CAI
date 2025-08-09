import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const uploadSuccessRate = new Rate('upload_success');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 5 },  // Ramp up to 5 users
    { duration: '3m', target: 5 },  // Stay at 5 users
    { duration: '1m', target: 10 }, // Ramp up to 10 users
    { duration: '3m', target: 10 }, // Stay at 10 users
    { duration: '1m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<10000'], // 95% of requests should be below 10s
    http_req_failed: ['rate<0.05'],     // Error rate should be below 5%
    upload_success: ['rate>0.95'],      // Upload success rate should be above 95%
  },
};

// Base URL
const BASE_URL = 'http://localhost:5000';

// Mock CAD file content (simplified for testing)
const mockCADFileContent = `
DWG FILE HEADER
VERSION: AutoCAD 2018
CREATED: 2024-01-01
ENTITIES:
LINE 0,0,0 100,100,0
CIRCLE 50,50,0 25
ARC 75,75,0 15 0 90
TEXT 10,10,0 "Test CAD File"
LAYER: 0
COLOR: BYLAYER
LINETYPE: CONTINUOUS
END OF FILE
`.repeat(100); // Make it larger to simulate real file

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
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Create a unique filename for each virtual user and iteration
  const filename = `load-test-${__VU}-${__ITER}.dwg`;
  
  // Prepare multipart form data
  const formData = {
    files: http.file(mockCADFileContent, filename, 'application/octet-stream'),
    projectName: `Load Test Project ${__VU}`,
    tags: `load-test,vu-${__VU},iter-${__ITER}`,
    description: `Load test file uploaded by VU ${__VU} in iteration ${__ITER}`,
  };

  // Upload file
  const uploadResponse = http.post(`${BASE_URL}/api/files/upload`, formData, { headers });
  
  const uploadSuccess = check(uploadResponse, {
    'upload status is 200': (r) => r.status === 200,
    'upload response time < 10000ms': (r) => r.timings.duration < 10000,
    'upload returns file info': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && Array.isArray(body.files) && body.files.length > 0;
      } catch (e) {
        return false;
      }
    },
  });

  if (uploadSuccess) {
    uploadSuccessRate.add(1);
    
    // Get the uploaded file ID
    try {
      const uploadData = JSON.parse(uploadResponse.body);
      const fileId = uploadData.files[0].id;
      
      sleep(2);
      
      // Test file retrieval
      const fileResponse = http.get(`${BASE_URL}/api/files/${fileId}`, { headers });
      check(fileResponse, {
        'file retrieval status is 200': (r) => r.status === 200,
        'file retrieval response time < 2000ms': (r) => r.timings.duration < 2000,
      }) || errorRate.add(1);
      
      sleep(1);
      
      // Test thumbnail generation (if available)
      const thumbnailResponse = http.get(`${BASE_URL}/api/files/${fileId}/thumbnail`, { headers });
      check(thumbnailResponse, {
        'thumbnail request completes': (r) => r.status === 200 || r.status === 404,
        'thumbnail response time < 3000ms': (r) => r.timings.duration < 3000,
      }) || errorRate.add(1);
      
    } catch (e) {
      console.error('Failed to parse upload response:', e);
      errorRate.add(1);
    }
  } else {
    uploadSuccessRate.add(0);
    errorRate.add(1);
  }

  sleep(3);
}

export function teardown(data) {
  // Logout
  if (data.authToken) {
    http.post(`${BASE_URL}/api/auth/logout`, null, {
      headers: { 'Authorization': `Bearer ${data.authToken}` },
    });
  }
}