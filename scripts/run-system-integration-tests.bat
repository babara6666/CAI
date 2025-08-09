@echo off
REM System Integration Test Runner for Windows
REM This script runs comprehensive integration tests for the entire CAD AI Platform

setlocal enabledelayedexpansion

echo 🚀 Starting CAD AI Platform System Integration Tests
echo ==================================================

REM Test results tracking
set TOTAL_TESTS=0
set PASSED_TESTS=0
set FAILED_TESTS=0

REM Function to log test results
:log_test_result
set test_name=%1
set status=%2
set details=%3

set /a TOTAL_TESTS+=1

if "%status%"=="PASS" (
    set /a PASSED_TESTS+=1
    echo ✓ %test_name%
) else (
    set /a FAILED_TESTS+=1
    echo ✗ %test_name%
    if not "%details%"=="" (
        echo   Error: %details%
    )
)
goto :eof

REM Function to check if service is running
:check_service
set service_name=%1
set port=%2
set max_attempts=30
set attempt=1

echo Checking %service_name% on port %port%...

:check_loop
curl -s "http://localhost:%port%/health" >nul 2>&1
if %errorlevel%==0 (
    echo %service_name% is running
    goto :eof
)

echo Attempt %attempt%/%max_attempts%: Waiting for %service_name%...
timeout /t 2 /nobreak >nul
set /a attempt+=1

if %attempt% leq %max_attempts% goto check_loop

echo %service_name% failed to start
exit /b 1

REM Function to run database migrations
:run_migrations
echo Running database migrations...

cd backend
call npm run migrate
if %errorlevel%==0 (
    call :log_test_result "Database Migrations" "PASS"
    cd ..
    goto :eof
) else (
    call :log_test_result "Database Migrations" "FAIL" "Migration failed"
    cd ..
    exit /b 1
)

REM Function to seed test data
:seed_test_data
echo Seeding test data...

cd backend
call npm run seed
if %errorlevel%==0 (
    call :log_test_result "Test Data Seeding" "PASS"
    cd ..
    goto :eof
) else (
    call :log_test_result "Test Data Seeding" "FAIL" "Seeding failed"
    cd ..
    exit /b 1
)

REM Function to run backend tests
:run_backend_tests
echo Running backend integration tests...

cd backend

REM Run unit tests
call npm run test:unit
if %errorlevel%==0 (
    call :log_test_result "Backend Unit Tests" "PASS"
) else (
    call :log_test_result "Backend Unit Tests" "FAIL" "Unit tests failed"
)

REM Run integration tests
call npm run test:integration
if %errorlevel%==0 (
    call :log_test_result "Backend Integration Tests" "PASS"
) else (
    call :log_test_result "Backend Integration Tests" "FAIL" "Integration tests failed"
)

REM Run system integration tests
call npm run test -- --testPathPattern=system-integration
if %errorlevel%==0 (
    call :log_test_result "Backend System Integration Tests" "PASS"
) else (
    call :log_test_result "Backend System Integration Tests" "FAIL" "System integration tests failed"
)

REM Run performance tests
call npm run test:performance
if %errorlevel%==0 (
    call :log_test_result "Backend Performance Tests" "PASS"
) else (
    call :log_test_result "Backend Performance Tests" "FAIL" "Performance tests failed"
)

REM Run security tests
call npm run test:security
if %errorlevel%==0 (
    call :log_test_result "Backend Security Tests" "PASS"
) else (
    call :log_test_result "Backend Security Tests" "FAIL" "Security tests failed"
)

cd ..
goto :eof

REM Function to run AI service tests
:run_ai_service_tests
echo Running AI service tests...

cd ai-service

REM Run unit tests
python -m pytest tests/test_*.py -v
if %errorlevel%==0 (
    call :log_test_result "AI Service Unit Tests" "PASS"
) else (
    call :log_test_result "AI Service Unit Tests" "FAIL" "AI unit tests failed"
)

REM Run system integration tests
python -m pytest tests/test_system_integration.py -v
if %errorlevel%==0 (
    call :log_test_result "AI Service System Integration Tests" "PASS"
) else (
    call :log_test_result "AI Service System Integration Tests" "FAIL" "AI system integration tests failed"
)

cd ..
goto :eof

REM Function to run frontend tests
:run_frontend_tests
echo Running frontend tests...

cd frontend

REM Run unit tests
call npm run test:unit
if %errorlevel%==0 (
    call :log_test_result "Frontend Unit Tests" "PASS"
) else (
    call :log_test_result "Frontend Unit Tests" "FAIL" "Frontend unit tests failed"
)

REM Run component tests
call npm run test:components
if %errorlevel%==0 (
    call :log_test_result "Frontend Component Tests" "PASS"
) else (
    call :log_test_result "Frontend Component Tests" "FAIL" "Component tests failed"
)

cd ..
goto :eof

REM Function to run end-to-end tests
:run_e2e_tests
echo Running end-to-end tests...

cd frontend

REM Run Playwright E2E tests
call npx playwright test --config=playwright.config.ts
if %errorlevel%==0 (
    call :log_test_result "End-to-End Tests" "PASS"
) else (
    call :log_test_result "End-to-End Tests" "FAIL" "E2E tests failed"
)

REM Run system integration E2E tests
call npx playwright test src/__tests__/e2e/system-integration.e2e.test.ts
if %errorlevel%==0 (
    call :log_test_result "System Integration E2E Tests" "PASS"
) else (
    call :log_test_result "System Integration E2E Tests" "FAIL" "System integration E2E tests failed"
)

cd ..
goto :eof

REM Function to validate system health
:validate_system_health
echo Validating system health...

REM Check Frontend
call :check_service "Frontend" "3000"
if %errorlevel%==0 (
    call :log_test_result "Frontend Health Check" "PASS"
) else (
    call :log_test_result "Frontend Health Check" "FAIL" "Service not responding"
)

REM Check Backend
call :check_service "Backend" "5000"
if %errorlevel%==0 (
    call :log_test_result "Backend Health Check" "PASS"
) else (
    call :log_test_result "Backend Health Check" "FAIL" "Service not responding"
)

REM Check AI Service
call :check_service "AI Service" "8000"
if %errorlevel%==0 (
    call :log_test_result "AI Service Health Check" "PASS"
) else (
    call :log_test_result "AI Service Health Check" "FAIL" "Service not responding"
)

REM Check metrics
curl -s "http://localhost:5000/metrics" | findstr "http_requests_total" >nul
if %errorlevel%==0 (
    call :log_test_result "Metrics Collection" "PASS"
) else (
    call :log_test_result "Metrics Collection" "FAIL" "Metrics not available"
)

REM Check logging
if exist "backend\logs\app.log" (
    for %%A in ("backend\logs\app.log") do if %%~zA gtr 0 (
        call :log_test_result "Application Logging" "PASS"
    ) else (
        call :log_test_result "Application Logging" "FAIL" "Log file empty"
    )
) else (
    call :log_test_result "Application Logging" "FAIL" "Log file not found"
)

goto :eof

REM Function to test AI workflows
:test_ai_workflows
echo Testing AI model workflows...

REM Get authentication token
for /f "tokens=*" %%i in ('curl -s -X POST "http://localhost:5000/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"TestPassword123!\"}" ^| jq -r .token') do set TEST_TOKEN=%%i

if "%TEST_TOKEN%"=="null" (
    call :log_test_result "Authentication" "FAIL" "Failed to get token"
    goto :eof
)

REM Test dataset creation
curl -s -X POST "http://localhost:5000/api/ai/datasets" -H "Content-Type: application/json" -H "Authorization: Bearer %TEST_TOKEN%" -d "{\"name\":\"Integration Test Dataset\",\"description\":\"Dataset for integration testing\",\"files\":[\"test-file-1\",\"test-file-2\",\"test-file-3\"],\"labels\":[\"mechanical\",\"electrical\",\"structural\"]}" > dataset_response.json

for /f "tokens=*" %%i in ('jq -r .dataset.id dataset_response.json 2^>nul') do set DATASET_ID=%%i

if not "%DATASET_ID%"=="null" (
    call :log_test_result "Dataset Creation API" "PASS"
) else (
    call :log_test_result "Dataset Creation API" "FAIL" "Dataset creation failed"
    goto :eof
)

REM Test search functionality
curl -s -X POST "http://localhost:5000/api/search/query" -H "Content-Type: application/json" -H "Authorization: Bearer %TEST_TOKEN%" -d "{\"query\":\"find mechanical parts\",\"filters\":{\"tags\":[\"mechanical\"]}}" > search_response.json

jq -e .results search_response.json >nul 2>&1
if %errorlevel%==0 (
    call :log_test_result "Search API" "PASS"
) else (
    call :log_test_result "Search API" "FAIL" "Search functionality failed"
)

REM Cleanup temp files
del dataset_response.json search_response.json 2>nul

goto :eof

REM Function to generate test report
:generate_test_report
echo.
echo ==================================================
echo System Integration Test Results
echo ==================================================
echo.
echo Total Tests: %TOTAL_TESTS%
echo Passed: %PASSED_TESTS%
echo Failed: %FAILED_TESTS%
echo.

if %FAILED_TESTS%==0 (
    echo 🎉 All system integration tests passed!
    echo.
    echo The CAD AI Platform is ready for deployment.
) else (
    echo ❌ Some tests failed. Please review the results above.
)

echo.
echo Test completed at %date% %time%

goto :eof

REM Main execution
:main
echo Preparing test environment...

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker is not running. Please start Docker and try again.
    exit /b 1
)

REM Start services with docker-compose
echo Starting services...
docker-compose up -d

REM Wait for services to be ready
echo Waiting for services to start...
timeout /t 30 /nobreak >nul

REM Run all test suites
call :run_migrations
call :seed_test_data
call :validate_system_health
call :run_backend_tests
call :run_ai_service_tests
call :run_frontend_tests
call :run_e2e_tests
call :test_ai_workflows

REM Generate final report
call :generate_test_report

REM Cleanup
echo Cleaning up...
docker-compose down

REM Exit with appropriate code
if %FAILED_TESTS%==0 (
    exit /b 0
) else (
    exit /b 1
)

REM Run main function
call :main