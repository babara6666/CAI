import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const searchSuccessRate = new Rate('search_success');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 15 }, // Ramp up to 15 users
    { duration: '5m', target: 15 }, // Stay at 15 users
    { duration: '2m', target: 30 }, // Ramp up to 30 users
    { duration: '5m', target: 30 }, // Stay at 30 users
    { duration: '1m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests should be below 3s
    http_req_failed: ['rate<0.1'],     // Error rate should be below 10%
    search_success: ['rate>0.9'],      // Search success rate should be above 90%
  },
};

// Base URL
const BASE_URL = 'http://localhost:5000';

// Search queries for testing
const searchQueries = [
  'mechanical parts',
  'electrical components',
  'structural elements',
  'hydraulic systems',
  'pneumatic devices',
  'gear assemblies',
  'motor components',
  'bearing systems',
  'valve mechanisms',
  'sensor devices',
  'control panels',
  'circuit boards',
  'power supplies',
  'cooling systems',
  'mounting brackets',
  'fasteners bolts',
  'springs dampers',
  'seals gaskets',
  'pipes fittings',
  'connectors cables'
];

// Filter combinations for testing
const filterCombinations = [
  { tags: ['mechanical'] },
  { tags: ['electrical'] },
  { tags: ['structural'] },
  { tags: ['mechanical', 'electrical'] },
  { projectName: 'Test Project' },
  { tags: ['mechanical'], projectName: 'Engineering Project' },
  {},
  { tags: ['hydraulic', 'pneumatic'] },
  { tags: ['sensor'], projectName: 'Control System' },
  { tags: ['motor', 'gear'] }
];

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

  // Select random query and filters
  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const filters = filterCombinations[Math.floor(Math.random() * filterCombinations.length)];

  // Test 1: Basic search query
  const searchPayload = JSON.stringify({
    query: query,
    filters: filters
  });

  const searchResponse = http.post(`${BASE_URL}/api/search/query`, searchPayload, { headers });
  
  const searchSuccess = check(searchResponse, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 3000ms': (r) => r.timings.duration < 3000,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.results !== undefined && Array.isArray(body.results);
      } catch (e) {
        return false;
      }
    },
    'search includes query metadata': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.queryId !== undefined && body.resultCount !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  if (searchSuccess) {
    searchSuccessRate.add(1);
    
    try {
      const searchData = JSON.parse(searchResponse.body);
      
      sleep(1);
      
      // Test 2: Search suggestions (if search was successful)
      const partialQuery = query.substring(0, Math.floor(query.length / 2));
      const suggestionsResponse = http.get(
        `${BASE_URL}/api/search/suggestions?partial=${encodeURIComponent(partialQuery)}`,
        { headers }
      );
      
      check(suggestionsResponse, {
        'suggestions status is 200': (r) => r.status === 200,
        'suggestions response time < 1000ms': (r) => r.timings.duration < 1000,
        'suggestions returns array': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.suggestions);
          } catch (e) {
            return false;
          }
        },
      }) || errorRate.add(1);
      
      sleep(1);
      
      // Test 3: Provide feedback on search results (if results exist)
      if (searchData.results && searchData.results.length > 0) {
        const feedbackPayload = JSON.stringify({
          queryId: searchData.queryId,
          resultId: searchData.results[0].id || 'test-result-id',
          rating: Math.floor(Math.random() * 5) + 1, // Random rating 1-5
          comment: `Load test feedback for query: ${query}`,
          helpful: Math.random() > 0.5
        });
        
        const feedbackResponse = http.post(`${BASE_URL}/api/search/feedback`, feedbackPayload, { headers });
        
        check(feedbackResponse, {
          'feedback status is 200': (r) => r.status === 200,
          'feedback response time < 1000ms': (r) => r.timings.duration < 1000,
        }) || errorRate.add(1);
      }
      
      sleep(1);
      
      // Test 4: Advanced search with AI model (if available)
      const aiSearchPayload = JSON.stringify({
        query: query,
        filters: filters,
        useAI: true,
        modelId: 'default'
      });
      
      const aiSearchResponse = http.post(`${BASE_URL}/api/search/query`, aiSearchPayload, { headers });
      
      check(aiSearchResponse, {
        'AI search completes': (r) => r.status === 200 || r.status === 503, // 503 if AI unavailable
        'AI search response time < 5000ms': (r) => r.timings.duration < 5000,
      }) || errorRate.add(1);
      
    } catch (e) {
      console.error('Failed to parse search response:', e);
      errorRate.add(1);
    }
  } else {
    searchSuccessRate.add(0);
    errorRate.add(1);
  }

  sleep(2);

  // Test 5: Search history
  const historyResponse = http.get(`${BASE_URL}/api/search/history`, { headers });
  check(historyResponse, {
    'search history status is 200': (r) => r.status === 200,
    'search history response time < 1000ms': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);

  sleep(1);

  // Test 6: Concurrent search with different parameters
  const concurrentQuery = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  const concurrentFilters = { tags: ['concurrent-test'] };
  
  const concurrentPayload = JSON.stringify({
    query: concurrentQuery,
    filters: concurrentFilters,
    top_k: 10
  });

  const concurrentResponse = http.post(`${BASE_URL}/api/search/query`, concurrentPayload, { headers });
  
  check(concurrentResponse, {
    'concurrent search status is 200': (r) => r.status === 200,
    'concurrent search response time < 3000ms': (r) => r.timings.duration < 3000,
  }) || errorRate.add(1);

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