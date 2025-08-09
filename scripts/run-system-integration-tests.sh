#!/bin/bash

# System Integration Test Runner
# This script runs comprehensive integration tests for the entire CAD AI Platform

set -e

echo "🚀 Starting CAD AI Platform System Integration Tests"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Function to log test results
log_test_result() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$status" = "PASS" ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo -e "${GREEN}✓ $test_name${NC}"
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo -e "${RED}✗ $test_name${NC}"
        if [ -n "$details" ]; then
            echo -e "${RED}  Error: $details${NC}"
        fi
    fi
    
    TEST_RESULTS+=("$test_name: $status")
}

# Function to check if service is running
check_service() {
    local service_name="$1"
    local port="$2"
    local max_attempts=30
    local attempt=1
    
    echo -e "${BLUE}Checking $service_name on port $port...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
            echo -e "${GREEN}$service_name is running${NC}"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts: Waiting for $service_name..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}$service_name failed to start${NC}"
    return 1
}

# Function to run database migrations
run_migrations() {
    echo -e "${BLUE}Running database migrations...${NC}"
    
    cd backend
    if npm run migrate; then
        log_test_result "Database Migrations" "PASS"
        cd ..
        return 0
    else
        log_test_result "Database Migrations" "FAIL" "Migration failed"
        cd ..
        return 1
    fi
}

# Function to seed test data
seed_test_data() {
    echo -e "${BLUE}Seeding test data...${NC}"
    
    cd backend
    if npm run seed; then
        log_test_result "Test Data Seeding" "PASS"
        cd ..
        return 0
    else
        log_test_result "Test Data Seeding" "FAIL" "Seeding failed"
        cd ..
        return 1
    fi
}

# Function to run backend integration tests
run_backend_tests() {
    echo -e "${BLUE}Running backend integration tests...${NC}"
    
    cd backend
    
    # Run unit tests
    if npm run test:unit; then
        log_test_result "Backend Unit Tests" "PASS"
    else
        log_test_result "Backend Unit Tests" "FAIL" "Unit tests failed"
    fi
    
    # Run integration tests
    if npm run test:integration; then
        log_test_result "Backend Integration Tests" "PASS"
    else
        log_test_result "Backend Integration Tests" "FAIL" "Integration tests failed"
    fi
    
    # Run system integration tests
    if npm run test -- --testPathPattern=system-integration; then
        log_test_result "Backend System Integration Tests" "PASS"
    else
        log_test_result "Backend System Integration Tests" "FAIL" "System integration tests failed"
    fi
    
    # Run performance tests
    if npm run test:performance; then
        log_test_result "Backend Performance Tests" "PASS"
    else
        log_test_result "Backend Performance Tests" "FAIL" "Performance tests failed"
    fi
    
    # Run security tests
    if npm run test:security; then
        log_test_result "Backend Security Tests" "PASS"
    else
        log_test_result "Backend Security Tests" "FAIL" "Security tests failed"
    fi
    
    cd ..
}

# Function to run AI service tests
run_ai_service_tests() {
    echo -e "${BLUE}Running AI service tests...${NC}"
    
    cd ai-service
    
    # Run unit tests
    if python -m pytest tests/test_*.py -v; then
        log_test_result "AI Service Unit Tests" "PASS"
    else
        log_test_result "AI Service Unit Tests" "FAIL" "AI unit tests failed"
    fi
    
    # Run system integration tests
    if python -m pytest tests/test_system_integration.py -v; then
        log_test_result "AI Service System Integration Tests" "PASS"
    else
        log_test_result "AI Service System Integration Tests" "FAIL" "AI system integration tests failed"
    fi
    
    cd ..
}

# Function to run frontend tests
run_frontend_tests() {
    echo -e "${BLUE}Running frontend tests...${NC}"
    
    cd frontend
    
    # Run unit tests
    if npm run test:unit; then
        log_test_result "Frontend Unit Tests" "PASS"
    else
        log_test_result "Frontend Unit Tests" "FAIL" "Frontend unit tests failed"
    fi
    
    # Run component tests
    if npm run test:components; then
        log_test_result "Frontend Component Tests" "PASS"
    else
        log_test_result "Frontend Component Tests" "FAIL" "Component tests failed"
    fi
    
    cd ..
}

# Function to run end-to-end tests
run_e2e_tests() {
    echo -e "${BLUE}Running end-to-end tests...${NC}"
    
    cd frontend
    
    # Run Playwright E2E tests
    if npx playwright test --config=playwright.config.ts; then
        log_test_result "End-to-End Tests" "PASS"
    else
        log_test_result "End-to-End Tests" "FAIL" "E2E tests failed"
    fi
    
    # Run system integration E2E tests
    if npx playwright test src/__tests__/e2e/system-integration.e2e.test.ts; then
        log_test_result "System Integration E2E Tests" "PASS"
    else
        log_test_result "System Integration E2E Tests" "FAIL" "System integration E2E tests failed"
    fi
    
    cd ..
}

# Function to run load tests
run_load_tests() {
    echo -e "${BLUE}Running load tests...${NC}"
    
    # Install k6 if not present
    if ! command -v k6 &> /dev/null; then
        echo "Installing k6 for load testing..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install k6
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo apt-get update && sudo apt-get install -y k6
        else
            echo -e "${YELLOW}k6 not installed. Skipping load tests.${NC}"
            log_test_result "Load Tests" "SKIP" "k6 not available"
            return 0
        fi
    fi
    
    # Run load tests
    if k6 run scripts/load-tests/api-load-test.js; then
        log_test_result "API Load Tests" "PASS"
    else
        log_test_result "API Load Tests" "FAIL" "API load tests failed"
    fi
    
    if k6 run scripts/load-tests/file-upload-load-test.js; then
        log_test_result "File Upload Load Tests" "PASS"
    else
        log_test_result "File Upload Load Tests" "FAIL" "File upload load tests failed"
    fi
    
    if k6 run scripts/load-tests/search-load-test.js; then
        log_test_result "Search Load Tests" "PASS"
    else
        log_test_result "Search Load Tests" "FAIL" "Search load tests failed"
    fi
}

# Function to run security tests
run_security_tests() {
    echo -e "${BLUE}Running security tests...${NC}"
    
    # Run OWASP ZAP security scan if available
    if command -v zap-baseline.py &> /dev/null; then
        if zap-baseline.py -t http://localhost:3000; then
            log_test_result "OWASP ZAP Security Scan" "PASS"
        else
            log_test_result "OWASP ZAP Security Scan" "FAIL" "Security vulnerabilities found"
        fi
    else
        echo -e "${YELLOW}OWASP ZAP not installed. Skipping security scan.${NC}"
        log_test_result "OWASP ZAP Security Scan" "SKIP" "ZAP not available"
    fi
    
    # Run custom security tests
    cd backend
    if npm run test:security; then
        log_test_result "Custom Security Tests" "PASS"
    else
        log_test_result "Custom Security Tests" "FAIL" "Custom security tests failed"
    fi
    cd ..
}

# Function to validate system health
validate_system_health() {
    echo -e "${BLUE}Validating system health...${NC}"
    
    # Check all services are responding
    services=(
        "Frontend:3000"
        "Backend:5000"
        "AI Service:8000"
        "Database:5432"
        "Redis:6379"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r name port <<< "$service"
        
        if [ "$name" = "Database" ] || [ "$name" = "Redis" ]; then
            # For database and Redis, just check if port is open
            if nc -z localhost "$port"; then
                log_test_result "$name Health Check" "PASS"
            else
                log_test_result "$name Health Check" "FAIL" "Service not responding"
            fi
        else
            # For web services, check health endpoint
            if check_service "$name" "$port"; then
                log_test_result "$name Health Check" "PASS"
            else
                log_test_result "$name Health Check" "FAIL" "Health check failed"
            fi
        fi
    done
    
    # Check system metrics
    if curl -s "http://localhost:5000/metrics" | grep -q "http_requests_total"; then
        log_test_result "Metrics Collection" "PASS"
    else
        log_test_result "Metrics Collection" "FAIL" "Metrics not available"
    fi
    
    # Check logging
    if [ -f "backend/logs/app.log" ] && [ -s "backend/logs/app.log" ]; then
        log_test_result "Application Logging" "PASS"
    else
        log_test_result "Application Logging" "FAIL" "Log files not found or empty"
    fi
}

# Function to test AI model workflows
test_ai_workflows() {
    echo -e "${BLUE}Testing AI model workflows...${NC}"
    
    # Test dataset creation via API
    dataset_response=$(curl -s -X POST "http://localhost:5000/api/ai/datasets" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -d '{
            "name": "Integration Test Dataset",
            "description": "Dataset for integration testing",
            "files": ["test-file-1", "test-file-2", "test-file-3"],
            "labels": ["mechanical", "electrical", "structural"]
        }')
    
    if echo "$dataset_response" | jq -e '.dataset.id' > /dev/null 2>&1; then
        log_test_result "Dataset Creation API" "PASS"
        dataset_id=$(echo "$dataset_response" | jq -r '.dataset.id')
    else
        log_test_result "Dataset Creation API" "FAIL" "Dataset creation failed"
        return 1
    fi
    
    # Test model training via API
    training_response=$(curl -s -X POST "http://localhost:5000/api/ai/train" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -d "{
            \"datasetId\": \"$dataset_id\",
            \"modelConfig\": {
                \"architecture\": \"cnn\",
                \"hyperparameters\": {
                    \"learningRate\": 0.001,
                    \"batchSize\": 16,
                    \"epochs\": 3
                }
            }
        }")
    
    if echo "$training_response" | jq -e '.trainingJob.id' > /dev/null 2>&1; then
        log_test_result "Model Training API" "PASS"
        job_id=$(echo "$training_response" | jq -r '.trainingJob.id')
    else
        log_test_result "Model Training API" "FAIL" "Training job creation failed"
        return 1
    fi
    
    # Test search functionality
    search_response=$(curl -s -X POST "http://localhost:5000/api/search/query" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -d '{
            "query": "find mechanical parts",
            "filters": {
                "tags": ["mechanical"]
            }
        }')
    
    if echo "$search_response" | jq -e '.results' > /dev/null 2>&1; then
        log_test_result "Search API" "PASS"
    else
        log_test_result "Search API" "FAIL" "Search functionality failed"
    fi
}

# Function to generate test report
generate_test_report() {
    echo ""
    echo "=================================================="
    echo -e "${BLUE}System Integration Test Results${NC}"
    echo "=================================================="
    echo ""
    echo -e "Total Tests: ${BLUE}$TOTAL_TESTS${NC}"
    echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}🎉 All system integration tests passed!${NC}"
        echo ""
        echo "The CAD AI Platform is ready for deployment."
    else
        echo -e "${RED}❌ Some tests failed. Please review the results above.${NC}"
        echo ""
        echo "Failed tests:"
        for result in "${TEST_RESULTS[@]}"; do
            if [[ $result == *"FAIL"* ]]; then
                echo -e "${RED}  - $result${NC}"
            fi
        done
    fi
    
    echo ""
    echo "Detailed test results have been saved to: test-results.json"
    
    # Generate JSON report
    cat > test-results.json << EOF
{
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "summary": {
        "total": $TOTAL_TESTS,
        "passed": $PASSED_TESTS,
        "failed": $FAILED_TESTS,
        "success_rate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    },
    "results": [
$(printf '%s\n' "${TEST_RESULTS[@]}" | sed 's/.*/"&"/' | paste -sd ',' -)
    ]
}
EOF
}

# Main execution
main() {
    echo -e "${BLUE}Preparing test environment...${NC}"
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Docker is not running. Please start Docker and try again.${NC}"
        exit 1
    fi
    
    # Start services with docker-compose
    echo -e "${BLUE}Starting services...${NC}"
    docker-compose up -d
    
    # Wait for services to be ready
    sleep 30
    
    # Get test authentication token
    echo -e "${BLUE}Getting authentication token...${NC}"
    auth_response=$(curl -s -X POST "http://localhost:5000/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "test@example.com",
            "password": "TestPassword123!"
        }')
    
    if echo "$auth_response" | jq -e '.token' > /dev/null 2>&1; then
        TEST_TOKEN=$(echo "$auth_response" | jq -r '.token')
        echo -e "${GREEN}Authentication successful${NC}"
    else
        echo -e "${RED}Failed to get authentication token${NC}"
        exit 1
    fi
    
    # Run all test suites
    run_migrations
    seed_test_data
    validate_system_health
    run_backend_tests
    run_ai_service_tests
    run_frontend_tests
    run_e2e_tests
    test_ai_workflows
    run_load_tests
    run_security_tests
    
    # Generate final report
    generate_test_report
    
    # Cleanup
    echo -e "${BLUE}Cleaning up...${NC}"
    docker-compose down
    
    # Exit with appropriate code
    if [ $FAILED_TESTS -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"