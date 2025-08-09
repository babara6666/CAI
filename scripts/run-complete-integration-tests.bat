@echo off
REM Complete System Integration Test Runner
REM This script orchestrates all integration tests for the CAD AI Platform

setlocal enabledelayedexpansion

echo 🚀 CAD AI Platform - Complete Integration Test Suite
echo ====================================================

REM Test configuration
set TOTAL_TEST_SUITES=0
set PASSED_TEST_SUITES=0
set FAILED_TEST_SUITES=0

REM Function to log test suite results
:log_suite_result
set suite_name=%1
set status=%2
set details=%3

set /a TOTAL_TEST_SUITES+=1

if "%status%"=="PASS" (
    set /a PASSED_TEST_SUITES+=1
    echo ✓ %suite_name% - PASSED
) else (
    set /a FAILED_TEST_SUITES+=1
    echo ✗ %suite_name% - FAILED
    if not "%details%"=="" (
        echo   Details: %details%
    )
)
goto :eof

REM Function to check service health
:check_service_health
set service_name=%1
set port=%2

echo Checking %service_name% health...
curl -s "http://localhost:%port%/health" >nul 2>&1
if %errorlevel%==0 (
    echo %service_name% is healthy
    goto :eof
) else (
    echo %service_name% is not responding
    exit /b 1
)

REM Function to run backend tests
:run_backend_test_suite
echo.
echo ================================================
echo Running Backend Test Suite
echo ================================================

cd backend

REM Unit tests
echo Running backend unit tests...
call npm run test:unit
if %errorlevel%==0 (
    call :log_suite_result "Backend Unit Tests" "PASS"
) else (
    call :log_suite_result "Backend Unit Tests" "FAIL" "Unit tests failed"
)

REM Integration tests
echo Running backend integration tests...
call npm run test:integration
if %errorlevel%==0 (
    call :log_suite_result "Backend Integration Tests" "PASS"
) else (
    call :log_suite_result "Backend Integration Tests" "FAIL" "Integration tests failed"
)

REM System integration tests
echo Running backend system integration tests...
call npm run test -- --testPathPattern=system-integration --runInBand
if %errorlevel%==0 (
    call :log_suite_result "Backend System Integration Tests" "PASS"
) else (
    call :log_suite_result "Backend System Integration Tests" "FAIL" "System integration tests failed"
)

REM Performance tests
echo Running backend performance tests...
call npm run test:performance
if %errorlevel%==0 (
    call :log_suite_result "Backend Performance Tests" "PASS"
) else (
    call :log_suite_result "Backend Performance Tests" "FAIL" "Performance tests failed"
)

REM Security tests
echo Running backend security tests...
call npm run test:security
if %errorlevel%==0 (
    call :log_suite_result "Backend Security Tests" "PASS"
) else (
    call :log_suite_result "Backend Security Tests" "FAIL" "Security tests failed"
)

cd ..
goto :eof

REM Function to run AI service tests
:run_ai_service_test_suite
echo.
echo ================================================
echo Running AI Service Test Suite
echo ================================================

cd ai-service

REM Unit tests
echo Running AI service unit tests...
python -m pytest tests/test_*.py -v --tb=short
if %errorlevel%==0 (
    call :log_suite_result "AI Service Unit Tests" "PASS"
) else (
    call :log_suite_result "AI Service Unit Tests" "FAIL" "AI unit tests failed"
)

REM System integration tests
echo Running AI service system integration tests...
python -m pytest tests/test_system_integration.py -v --tb=short
if %errorlevel%==0 (
    call :log_suite_result "AI Service System Integration Tests" "PASS"
) else (
    call :log_suite_result "AI Service System Integration Tests" "FAIL" "AI system integration tests failed"
)

cd ..
goto :eof

REM Function to run frontend tests
:run_frontend_test_suite
echo.
echo ================================================
echo Running Frontend Test Suite
echo ================================================

cd frontend

REM Unit tests
echo Running frontend unit tests...
call npm run test:unit
if %errorlevel%==0 (
    call :log_suite_result "Frontend Unit Tests" "PASS"
) else (
    call :log_suite_result "Frontend Unit Tests" "FAIL" "Frontend unit tests failed"
)

REM Component tests
echo Running frontend component tests...
call npm run test:components
if %errorlevel%==0 (
    call :log_suite_result "Frontend Component Tests" "PASS"
) else (
    call :log_suite_result "Frontend Component Tests" "FAIL" "Component tests failed"
)

REM E2E tests
echo Running frontend E2E tests...
call npx playwright test --config=playwright.config.ts
if %errorlevel%==0 (
    call :log_suite_result "Frontend E2E Tests" "PASS"
) else (
    call :log_suite_result "Frontend E2E Tests" "FAIL" "E2E tests failed"
)

REM System integration E2E tests
echo Running system integration E2E tests...
call npx playwright test src/__tests__/e2e/system-integration.e2e.test.ts
if %errorlevel%==0 (
    call :log_suite_result "System Integration E2E Tests" "PASS"
) else (
    call :log_suite_result "System Integration E2E Tests" "FAIL" "System integration E2E tests failed"
)

cd ..
goto :eof

REM Function to run load tests
:run_load_test_suite
echo.
echo ================================================
echo Running Load Test Suite
echo ================================================

REM Check if k6 is available
where k6 >nul 2>&1
if %errorlevel% neq 0 (
    echo k6 not found. Skipping load tests.
    call :log_suite_result "Load Tests" "SKIP" "k6 not available"
    goto :eof
)

REM API load tests
echo Running API load tests...
k6 run scripts/load-tests/api-load-test.js
if %errorlevel%==0 (
    call :log_suite_result "API Load Tests" "PASS"
) else (
    call :log_suite_result "API Load Tests" "FAIL" "API load tests failed"
)

REM File upload load tests
echo Running file upload load tests...
k6 run scripts/load-tests/file-upload-load-test.js
if %errorlevel%==0 (
    call :log_suite_result "File Upload Load Tests" "PASS"
) else (
    call :log_suite_result "File Upload Load Tests" "FAIL" "File upload load tests failed"
)

REM Search load tests
echo Running search load tests...
k6 run scripts/load-tests/search-load-test.js
if %errorlevel%==0 (
    call :log_suite_result "Search Load Tests" "PASS"
) else (
    call :log_suite_result "Search Load Tests" "FAIL" "Search load tests failed"
)

goto :eof

REM Function to validate system health
:validate_system_health
echo.
echo ================================================
echo Validating System Health
echo ================================================

REM Check all services
call :check_service_health "Frontend" "3000"
if %errorlevel%==0 (
    call :log_suite_result "Frontend Health Check" "PASS"
) else (
    call :log_suite_result "Frontend Health Check" "FAIL" "Frontend not responding"
)

call :check_service_health "Backend" "5000"
if %errorlevel%==0 (
    call :log_suite_result "Backend Health Check" "PASS"
) else (
    call :log_suite_result "Backend Health Check" "FAIL" "Backend not responding"
)

call :check_service_health "AI Service" "8000"
if %errorlevel%==0 (
    call :log_suite_result "AI Service Health Check" "PASS"
) else (
    call :log_suite_result "AI Service Health Check" "FAIL" "AI Service not responding"
)

REM Check database connectivity
echo Checking database connectivity...
cd backend
call npm run db:check
if %errorlevel%==0 (
    call :log_suite_result "Database Connectivity" "PASS"
    cd ..
) else (
    call :log_suite_result "Database Connectivity" "FAIL" "Database connection failed"
    cd ..
)

REM Check Redis connectivity
echo Checking Redis connectivity...
redis-cli ping >nul 2>&1
if %errorlevel%==0 (
    call :log_suite_result "Redis Connectivity" "PASS"
) else (
    call :log_suite_result "Redis Connectivity" "FAIL" "Redis connection failed"
)

goto :eof

REM Function to run user acceptance tests
:run_user_acceptance_tests
echo.
echo ================================================
echo Running User Acceptance Tests
echo ================================================

REM Get authentication token for UAT
echo Getting authentication token...
for /f "tokens=*" %%i in ('curl -s -X POST "http://localhost:5000/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"TestPassword123!\"}" ^| jq -r .token') do set UAT_TOKEN=%%i

if "%UAT_TOKEN%"=="null" (
    call :log_suite_result "UAT Authentication" "FAIL" "Failed to get authentication token"
    goto :eof
)

REM Test new user registration workflow
echo Testing new user registration workflow...
curl -s -X POST "http://localhost:5000/api/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"uatuser@example.com\",\"username\":\"uatuser\",\"password\":\"UATUser123!\",\"role\":\"engineer\"}" >nul
if %errorlevel%==0 (
    call :log_suite_result "User Registration Workflow" "PASS"
) else (
    call :log_suite_result "User Registration Workflow" "FAIL" "Registration workflow failed"
)

REM Test file upload workflow
echo Testing file upload workflow...
echo Mock CAD content > temp_uat_file.dwg
curl -s -X POST "http://localhost:5000/api/files/upload" -H "Authorization: Bearer %UAT_TOKEN%" -F "files=@temp_uat_file.dwg" -F "projectName=UAT Project" -F "tags=uat,test" >nul
if %errorlevel%==0 (
    call :log_suite_result "File Upload Workflow" "PASS"
) else (
    call :log_suite_result "File Upload Workflow" "FAIL" "File upload workflow failed"
)
del temp_uat_file.dwg

REM Test search workflow
echo Testing search workflow...
curl -s -X POST "http://localhost:5000/api/search/query" -H "Content-Type: application/json" -H "Authorization: Bearer %UAT_TOKEN%" -d "{\"query\":\"test files\",\"filters\":{}}" >nul
if %errorlevel%==0 (
    call :log_suite_result "Search Workflow" "PASS"
) else (
    call :log_suite_result "Search Workflow" "FAIL" "Search workflow failed"
)

REM Test AI dataset creation workflow
echo Testing AI dataset creation workflow...
curl -s -X POST "http://localhost:5000/api/ai/datasets" -H "Content-Type: application/json" -H "Authorization: Bearer %UAT_TOKEN%" -d "{\"name\":\"UAT Dataset\",\"description\":\"Test dataset\",\"files\":[\"test-file\"],\"labels\":[\"test\"]}" >nul
if %errorlevel%==0 (
    call :log_suite_result "AI Dataset Creation Workflow" "PASS"
) else (
    call :log_suite_result "AI Dataset Creation Workflow" "FAIL" "Dataset creation workflow failed"
)

goto :eof

REM Function to generate comprehensive test report
:generate_comprehensive_report
echo.
echo ====================================================
echo COMPREHENSIVE INTEGRATION TEST RESULTS
echo ====================================================
echo.
echo Total Test Suites: %TOTAL_TEST_SUITES%
echo Passed: %PASSED_TEST_SUITES%
echo Failed: %FAILED_TEST_SUITES%
echo.

set /a SUCCESS_RATE=(%PASSED_TEST_SUITES% * 100) / %TOTAL_TEST_SUITES%
echo Success Rate: %SUCCESS_RATE%%%
echo.

if %FAILED_TEST_SUITES%==0 (
    echo 🎉 ALL INTEGRATION TESTS PASSED!
    echo.
    echo ✅ The CAD AI Platform has successfully passed all integration tests
    echo ✅ System is ready for production deployment
    echo ✅ All components are working together correctly
    echo ✅ Performance requirements are met
    echo ✅ Security measures are functioning properly
    echo ✅ User acceptance criteria are satisfied
) else (
    echo ❌ SOME INTEGRATION TESTS FAILED
    echo.
    echo Please review the failed test suites above and address the issues
    echo before proceeding with deployment.
)

echo.
echo Test completed at %date% %time%
echo Detailed logs are available in the respective test directories.

REM Generate JSON report
echo { > integration-test-results.json
echo   "timestamp": "%date% %time%", >> integration-test-results.json
echo   "test_type": "Complete Integration Testing", >> integration-test-results.json
echo   "summary": { >> integration-test-results.json
echo     "total_suites": %TOTAL_TEST_SUITES%, >> integration-test-results.json
echo     "passed": %PASSED_TEST_SUITES%, >> integration-test-results.json
echo     "failed": %FAILED_TEST_SUITES%, >> integration-test-results.json
echo     "success_rate": %SUCCESS_RATE% >> integration-test-results.json
echo   } >> integration-test-results.json
echo } >> integration-test-results.json

goto :eof

REM Main execution
:main
echo Initializing complete integration test suite...

REM Check prerequisites
echo Checking prerequisites...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker and try again.
    exit /b 1
)

REM Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not available. Please install Node.js.
    exit /b 1
)

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not available. Please install Python.
    exit /b 1
)

REM Start services
echo Starting all services...
docker-compose up -d

REM Wait for services to be ready
echo Waiting for services to start...
timeout /t 60 /nobreak >nul

REM Run database migrations
echo Running database migrations...
cd backend
call npm run migrate
if %errorlevel% neq 0 (
    echo ❌ Database migration failed
    cd ..
    exit /b 1
)

REM Seed test data
call npm run seed
if %errorlevel% neq 0 (
    echo ❌ Test data seeding failed
    cd ..
    exit /b 1
)
cd ..

REM Run all test suites
call :validate_system_health
call :run_backend_test_suite
call :run_ai_service_test_suite
call :run_frontend_test_suite
call :run_load_test_suite
call :run_user_acceptance_tests

REM Generate comprehensive report
call :generate_comprehensive_report

REM Cleanup
echo Cleaning up...
docker-compose down

REM Exit with appropriate code
if %FAILED_TEST_SUITES%==0 (
    echo.
    echo 🎉 Integration testing completed successfully!
    exit /b 0
) else (
    echo.
    echo ❌ Integration testing completed with failures.
    exit /b 1
)

REM Run main function
call :main