#!/bin/bash

# Comprehensive Test Suite Runner
# Runs all tests across backend, frontend, and AI service

set -e

echo "🚀 Starting Comprehensive Test Suite for CAD AI Platform"
echo "========================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
BACKEND_TESTS_PASSED=0
FRONTEND_TESTS_PASSED=0
AI_SERVICE_TESTS_PASSED=0
TOTAL_TESTS=0
PASSED_TESTS=0

# Function to run tests and track results
run_test_suite() {
    local service=$1
    local command=$2
    local directory=$3
    
    echo -e "\n${BLUE}📋 Running $service tests...${NC}"
    echo "----------------------------------------"
    
    cd "$directory"
    
    if eval "$command"; then
        echo -e "${GREEN}✅ $service tests passed${NC}"
        case $service in
            "Backend") BACKEND_TESTS_PASSED=1 ;;
            "Frontend") FRONTEND_TESTS_PASSED=1 ;;
            "AI Service") AI_SERVICE_TESTS_PASSED=1 ;;
        esac
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ $service tests failed${NC}"
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    cd - > /dev/null
}

# Start timing
START_TIME=$(date +%s)

# Run Backend Tests
echo -e "\n${YELLOW}🔧 BACKEND TESTING${NC}"
echo "=================="

run_test_suite "Backend Unit" "npm run test:unit" "backend"
run_test_suite "Backend Integration" "npm run test:integration" "backend"
run_test_suite "Backend Security" "npm run test:security" "backend"
run_test_suite "Backend Performance" "npm run test:performance" "backend"

# Run Frontend Tests
echo -e "\n${YELLOW}🎨 FRONTEND TESTING${NC}"
echo "==================="

run_test_suite "Frontend Unit" "npm run test:unit" "frontend"
run_test_suite "Frontend Integration" "npm run test:integration" "frontend"
run_test_suite "Frontend Accessibility" "npm run test:a11y" "frontend"
run_test_suite "Frontend E2E" "npm run test:e2e" "frontend"

# Run AI Service Tests
echo -e "\n${YELLOW}🤖 AI SERVICE TESTING${NC}"
echo "====================="

run_test_suite "AI Service" "python -m pytest --cov=src --cov-report=term-missing" "ai-service"

# Calculate total time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate final report
echo -e "\n${BLUE}📊 COMPREHENSIVE TEST REPORT${NC}"
echo "=============================================="
echo "Total Duration: ${DURATION}s"
echo "Tests Passed: ${PASSED_TESTS}/${TOTAL_TESTS}"

SUCCESS_RATE=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
echo "Success Rate: ${SUCCESS_RATE}%"

echo -e "\nDetailed Results:"
echo "----------------"

if [ $BACKEND_TESTS_PASSED -eq 1 ]; then
    echo -e "${GREEN}✅ Backend Tests: PASSED${NC}"
else
    echo -e "${RED}❌ Backend Tests: FAILED${NC}"
fi

if [ $FRONTEND_TESTS_PASSED -eq 1 ]; then
    echo -e "${GREEN}✅ Frontend Tests: PASSED${NC}"
else
    echo -e "${RED}❌ Frontend Tests: FAILED${NC}"
fi

if [ $AI_SERVICE_TESTS_PASSED -eq 1 ]; then
    echo -e "${GREEN}✅ AI Service Tests: PASSED${NC}"
else
    echo -e "${RED}❌ AI Service Tests: FAILED${NC}"
fi

# Save report to file
REPORT_FILE="test-reports/comprehensive-test-report-$(date +%Y%m%d-%H%M%S).json"
mkdir -p test-reports

cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "duration": $DURATION,
  "totalTests": $TOTAL_TESTS,
  "passedTests": $PASSED_TESTS,
  "successRate": $SUCCESS_RATE,
  "results": {
    "backend": $BACKEND_TESTS_PASSED,
    "frontend": $FRONTEND_TESTS_PASSED,
    "aiService": $AI_SERVICE_TESTS_PASSED
  }
}
EOF

echo -e "\n📄 Report saved to: $REPORT_FILE"

# Exit with appropriate code
if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "\n${GREEN}🎉 All tests passed successfully!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Check the details above.${NC}"
    exit 1
fi