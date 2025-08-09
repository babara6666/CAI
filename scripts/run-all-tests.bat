@echo off
REM Comprehensive Test Suite Runner for Windows
REM Runs all tests across backend, frontend, and AI service

echo 🚀 Starting Comprehensive Test Suite for CAD AI Platform
echo ========================================================

set BACKEND_TESTS_PASSED=0
set FRONTEND_TESTS_PASSED=0
set AI_SERVICE_TESTS_PASSED=0
set TOTAL_TESTS=0
set PASSED_TESTS=0

REM Function to run tests and track results
:run_test_suite
set SERVICE=%1
set COMMAND=%2
set DIRECTORY=%3

echo.
echo 📋 Running %SERVICE% tests...
echo ----------------------------------------

cd %DIRECTORY%

%COMMAND%
if %ERRORLEVEL% EQU 0 (
    echo ✅ %SERVICE% tests passed
    if "%SERVICE%"=="Backend" set BACKEND_TESTS_PASSED=1
    if "%SERVICE%"=="Frontend" set FRONTEND_TESTS_PASSED=1
    if "%SERVICE%"=="AI-Service" set AI_SERVICE_TESTS_PASSED=1
    set /a PASSED_TESTS+=1
) else (
    echo ❌ %SERVICE% tests failed
)

set /a TOTAL_TESTS+=1
cd ..
goto :eof

REM Start timing
set START_TIME=%TIME%

REM Run Backend Tests
echo.
echo 🔧 BACKEND TESTING
echo ==================

call :run_test_suite "Backend-Unit" "npm run test:unit" "backend"
call :run_test_suite "Backend-Integration" "npm run test:integration" "backend"
call :run_test_suite "Backend-Security" "npm run test:security" "backend"
call :run_test_suite "Backend-Performance" "npm run test:performance" "backend"

REM Run Frontend Tests
echo.
echo 🎨 FRONTEND TESTING
echo ===================

call :run_test_suite "Frontend-Unit" "npm run test:unit" "frontend"
call :run_test_suite "Frontend-Integration" "npm run test:integration" "frontend"
call :run_test_suite "Frontend-Accessibility" "npm run test:a11y" "frontend"
call :run_test_suite "Frontend-E2E" "npm run test:e2e" "frontend"

REM Run AI Service Tests
echo.
echo 🤖 AI SERVICE TESTING
echo =====================

call :run_test_suite "AI-Service" "python -m pytest --cov=src --cov-report=term-missing" "ai-service"

REM Generate final report
echo.
echo 📊 COMPREHENSIVE TEST REPORT
echo ==============================================
echo Tests Passed: %PASSED_TESTS%/%TOTAL_TESTS%

set /a SUCCESS_RATE=(%PASSED_TESTS% * 100) / %TOTAL_TESTS%
echo Success Rate: %SUCCESS_RATE%%%

echo.
echo Detailed Results:
echo ----------------

if %BACKEND_TESTS_PASSED% EQU 1 (
    echo ✅ Backend Tests: PASSED
) else (
    echo ❌ Backend Tests: FAILED
)

if %FRONTEND_TESTS_PASSED% EQU 1 (
    echo ✅ Frontend Tests: PASSED
) else (
    echo ❌ Frontend Tests: FAILED
)

if %AI_SERVICE_TESTS_PASSED% EQU 1 (
    echo ✅ AI Service Tests: PASSED
) else (
    echo ❌ AI Service Tests: FAILED
)

REM Create report directory if it doesn't exist
if not exist "test-reports" mkdir test-reports

REM Save report to file
set REPORT_FILE=test-reports\comprehensive-test-report-%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%-%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%.json
echo { > %REPORT_FILE%
echo   "timestamp": "%DATE% %TIME%", >> %REPORT_FILE%
echo   "totalTests": %TOTAL_TESTS%, >> %REPORT_FILE%
echo   "passedTests": %PASSED_TESTS%, >> %REPORT_FILE%
echo   "successRate": %SUCCESS_RATE%, >> %REPORT_FILE%
echo   "results": { >> %REPORT_FILE%
echo     "backend": %BACKEND_TESTS_PASSED%, >> %REPORT_FILE%
echo     "frontend": %FRONTEND_TESTS_PASSED%, >> %REPORT_FILE%
echo     "aiService": %AI_SERVICE_TESTS_PASSED% >> %REPORT_FILE%
echo   } >> %REPORT_FILE%
echo } >> %REPORT_FILE%

echo.
echo 📄 Report saved to: %REPORT_FILE%

REM Exit with appropriate code
if %PASSED_TESTS% EQU %TOTAL_TESTS% (
    echo.
    echo 🎉 All tests passed successfully!
    exit /b 0
) else (
    echo.
    echo ❌ Some tests failed. Check the details above.
    exit /b 1
)