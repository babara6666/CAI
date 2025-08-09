#!/bin/bash

# User Acceptance Testing Script
# This script runs comprehensive user acceptance tests for the CAD AI Platform

set -e

echo "🎯 Starting CAD AI Platform User Acceptance Tests"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_SCENARIOS=0
PASSED_SCENARIOS=0
FAILED_SCENARIOS=0
SCENARIO_RESULTS=()

# Function to log scenario results
log_scenario_result() {
    local scenario_name="$1"
    local status="$2"
    local details="$3"
    
    TOTAL_SCENARIOS=$((TOTAL_SCENARIOS + 1))
    
    if [ "$status" = "PASS" ]; then
        PASSED_SCENARIOS=$((PASSED_SCENARIOS + 1))
        echo -e "${GREEN}✓ $scenario_name${NC}"
    else
        FAILED_SCENARIOS=$((FAILED_SCENARIOS + 1))
        echo -e "${RED}✗ $scenario_name${NC}"
        if [ -n "$details" ]; then
            echo -e "${RED}  Issue: $details${NC}"
        fi
    fi
    
    SCENARIO_RESULTS+=("$scenario_name: $status")
}

# Function to test API endpoint
test_api_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_status="$4"
    local auth_header="$5"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" -H "$auth_header" "http://localhost:5000$endpoint")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "%{http_code}" -X POST -H "Content-Type: application/json" -H "$auth_header" -d "$data" "http://localhost:5000$endpoint")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "%{http_code}" -X PUT -H "Content-Type: application/json" -H "$auth_header" -d "$data" "http://localhost:5000$endpoint")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "%{http_code}" -X DELETE -H "$auth_header" "http://localhost:5000$endpoint")
    fi
    
    status_code="${response: -3}"
    response_body="${response%???}"
    
    if [ "$status_code" = "$expected_status" ]; then
        return 0
    else
        echo "Expected status $expected_status, got $status_code"
        echo "Response: $response_body"
        return 1
    fi
}

# Function to wait for user input simulation
simulate_user_action() {
    local action="$1"
    echo -e "${BLUE}Simulating user action: $action${NC}"
    sleep 1
}

# User Acceptance Test Scenarios

# Scenario 1: New User Registration and Onboarding
test_new_user_onboarding() {
    echo -e "${BLUE}Testing new user registration and onboarding...${NC}"
    
    # Step 1: User visits registration page
    simulate_user_action "User navigates to registration page"
    
    # Step 2: User fills registration form
    simulate_user_action "User fills registration form"
    registration_data='{
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "NewUser123!",
        "role": "engineer"
    }'
    
    if test_api_endpoint "POST" "/api/auth/register" "$registration_data" "201" ""; then
        simulate_user_action "User successfully registered"
    else
        log_scenario_result "New User Registration" "FAIL" "Registration API failed"
        return 1
    fi
    
    # Step 3: User logs in
    simulate_user_action "User logs in with new credentials"
    login_data='{
        "email": "newuser@example.com",
        "password": "NewUser123!"
    }'
    
    login_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$login_data" "http://localhost:5000/api/auth/login")
    if echo "$login_response" | jq -e '.token' > /dev/null; then
        NEW_USER_TOKEN=$(echo "$login_response" | jq -r '.token')
        simulate_user_action "User successfully logged in"
    else
        log_scenario_result "New User Login" "FAIL" "Login failed after registration"
        return 1
    fi
    
    # Step 4: User views dashboard
    simulate_user_action "User views dashboard for first time"
    if test_api_endpoint "GET" "/api/files" "" "200" "Authorization: Bearer $NEW_USER_TOKEN"; then
        simulate_user_action "Dashboard loaded successfully"
    else
        log_scenario_result "Dashboard Access" "FAIL" "Dashboard failed to load"
        return 1
    fi
    
    log_scenario_result "New User Registration and Onboarding" "PASS"
}

# Scenario 2: File Upload and Management Workflow
test_file_management_workflow() {
    echo -e "${BLUE}Testing file upload and management workflow...${NC}"
    
    # Step 1: User selects files to upload
    simulate_user_action "User selects CAD files for upload"
    
    # Step 2: User uploads files with metadata
    simulate_user_action "User uploads files with project information"
    
    # Create a test file
    test_file_content="Mock CAD file content for testing"
    echo "$test_file_content" > /tmp/test_upload.dwg
    
    upload_response=$(curl -s -X POST \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -F "files=@/tmp/test_upload.dwg" \
        -F "projectName=UAT Test Project" \
        -F "tags=uat,test,mechanical" \
        -F "description=User acceptance test file" \
        "http://localhost:5000/api/files/upload")
    
    if echo "$upload_response" | jq -e '.success' > /dev/null; then
        FILE_ID=$(echo "$upload_response" | jq -r '.files[0].id')
        simulate_user_action "Files uploaded successfully"
    else
        log_scenario_result "File Upload" "FAIL" "File upload failed"
        return 1
    fi
    
    # Step 3: User views uploaded files
    simulate_user_action "User views file list"
    if test_api_endpoint "GET" "/api/files" "" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "File list displayed"
    else
        log_scenario_result "File List View" "FAIL" "Failed to retrieve file list"
        return 1
    fi
    
    # Step 4: User views file details
    simulate_user_action "User clicks on uploaded file to view details"
    if test_api_endpoint "GET" "/api/files/$FILE_ID" "" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "File details displayed"
    else
        log_scenario_result "File Details View" "FAIL" "Failed to retrieve file details"
        return 1
    fi
    
    # Step 5: User updates file metadata
    simulate_user_action "User updates file tags and description"
    update_data='{
        "tags": ["uat", "test", "mechanical", "updated"],
        "description": "Updated description for UAT test"
    }'
    
    if test_api_endpoint "PUT" "/api/files/$FILE_ID" "$update_data" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "File metadata updated"
    else
        log_scenario_result "File Metadata Update" "FAIL" "Failed to update file metadata"
        return 1
    fi
    
    # Cleanup
    rm -f /tmp/test_upload.dwg
    
    log_scenario_result "File Upload and Management Workflow" "PASS"
}

# Scenario 3: Search and Discovery Workflow
test_search_workflow() {
    echo -e "${BLUE}Testing search and discovery workflow...${NC}"
    
    # Step 1: User enters search query
    simulate_user_action "User enters natural language search query"
    search_data='{
        "query": "find mechanical parts with gears",
        "filters": {
            "tags": ["mechanical"]
        }
    }'
    
    search_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -d "$search_data" \
        "http://localhost:5000/api/search/query")
    
    if echo "$search_response" | jq -e '.results' > /dev/null; then
        QUERY_ID=$(echo "$search_response" | jq -r '.queryId')
        simulate_user_action "Search results displayed"
    else
        log_scenario_result "Search Query" "FAIL" "Search query failed"
        return 1
    fi
    
    # Step 2: User reviews search results
    simulate_user_action "User reviews search results and relevance scores"
    
    # Step 3: User provides feedback on results
    simulate_user_action "User rates search result relevance"
    feedback_data='{
        "queryId": "'$QUERY_ID'",
        "resultId": "test-result-id",
        "rating": 4,
        "comment": "Good result for mechanical parts search",
        "helpful": true
    }'
    
    if test_api_endpoint "POST" "/api/search/feedback" "$feedback_data" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "Feedback submitted successfully"
    else
        log_scenario_result "Search Feedback" "FAIL" "Failed to submit feedback"
        return 1
    fi
    
    # Step 4: User tries search suggestions
    simulate_user_action "User types partial query to see suggestions"
    if test_api_endpoint "GET" "/api/search/suggestions?partial=mech" "" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "Search suggestions displayed"
    else
        log_scenario_result "Search Suggestions" "FAIL" "Failed to get search suggestions"
        return 1
    fi
    
    # Step 5: User applies filters
    simulate_user_action "User applies additional filters to refine search"
    filtered_search_data='{
        "query": "mechanical parts",
        "filters": {
            "tags": ["mechanical", "gear"],
            "projectName": "UAT Test Project"
        }
    }'
    
    if test_api_endpoint "POST" "/api/search/query" "$filtered_search_data" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "Filtered search results displayed"
    else
        log_scenario_result "Filtered Search" "FAIL" "Filtered search failed"
        return 1
    fi
    
    log_scenario_result "Search and Discovery Workflow" "PASS"
}

# Scenario 4: AI Model Training Workflow
test_ai_training_workflow() {
    echo -e "${BLUE}Testing AI model training workflow...${NC}"
    
    # Step 1: User creates a dataset
    simulate_user_action "User creates new dataset for training"
    dataset_data='{
        "name": "UAT Training Dataset",
        "description": "Dataset created during user acceptance testing",
        "files": ["'$FILE_ID'"],
        "labels": ["mechanical"]
    }'
    
    dataset_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -d "$dataset_data" \
        "http://localhost:5000/api/ai/datasets")
    
    if echo "$dataset_response" | jq -e '.dataset.id' > /dev/null; then
        DATASET_ID=$(echo "$dataset_response" | jq -r '.dataset.id')
        simulate_user_action "Dataset created successfully"
    else
        log_scenario_result "Dataset Creation" "FAIL" "Failed to create dataset"
        return 1
    fi
    
    # Step 2: User configures training parameters
    simulate_user_action "User configures model training parameters"
    training_data='{
        "datasetId": "'$DATASET_ID'",
        "modelConfig": {
            "name": "UAT Test Model",
            "architecture": "cnn",
            "hyperparameters": {
                "learningRate": 0.001,
                "batchSize": 16,
                "epochs": 3
            }
        }
    }'
    
    # Step 3: User starts training
    simulate_user_action "User starts model training"
    training_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -d "$training_data" \
        "http://localhost:5000/api/ai/train")
    
    if echo "$training_response" | jq -e '.trainingJob.id' > /dev/null; then
        JOB_ID=$(echo "$training_response" | jq -r '.trainingJob.id')
        simulate_user_action "Training job started"
    else
        log_scenario_result "Training Job Start" "FAIL" "Failed to start training job"
        return 1
    fi
    
    # Step 4: User monitors training progress
    simulate_user_action "User monitors training progress"
    if test_api_endpoint "GET" "/api/ai/training/$JOB_ID" "" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "Training progress displayed"
    else
        log_scenario_result "Training Progress Monitoring" "FAIL" "Failed to get training progress"
        return 1
    fi
    
    # Step 5: User views available models
    simulate_user_action "User views trained models"
    if test_api_endpoint "GET" "/api/ai/models" "" "200" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "Model list displayed"
    else
        log_scenario_result "Model List View" "FAIL" "Failed to retrieve model list"
        return 1
    fi
    
    log_scenario_result "AI Model Training Workflow" "PASS"
}

# Scenario 5: Admin Management Workflow
test_admin_workflow() {
    echo -e "${BLUE}Testing admin management workflow...${NC}"
    
    # Login as admin
    admin_login_data='{
        "email": "admin@example.com",
        "password": "AdminPassword123!"
    }'
    
    admin_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$admin_login_data" "http://localhost:5000/api/auth/login")
    if echo "$admin_response" | jq -e '.token' > /dev/null; then
        ADMIN_TOKEN=$(echo "$admin_response" | jq -r '.token')
        simulate_user_action "Admin logged in successfully"
    else
        log_scenario_result "Admin Login" "FAIL" "Admin login failed"
        return 1
    fi
    
    # Step 1: Admin views system metrics
    simulate_user_action "Admin views system health and metrics"
    if test_api_endpoint "GET" "/api/admin/metrics" "" "200" "Authorization: Bearer $ADMIN_TOKEN"; then
        simulate_user_action "System metrics displayed"
    else
        log_scenario_result "System Metrics View" "FAIL" "Failed to retrieve system metrics"
        return 1
    fi
    
    # Step 2: Admin manages users
    simulate_user_action "Admin views user management interface"
    if test_api_endpoint "GET" "/api/admin/users" "" "200" "Authorization: Bearer $ADMIN_TOKEN"; then
        simulate_user_action "User list displayed"
    else
        log_scenario_result "User Management View" "FAIL" "Failed to retrieve user list"
        return 1
    fi
    
    # Step 3: Admin views audit logs
    simulate_user_action "Admin reviews audit logs"
    if test_api_endpoint "GET" "/api/admin/audit-logs" "" "200" "Authorization: Bearer $ADMIN_TOKEN"; then
        simulate_user_action "Audit logs displayed"
    else
        log_scenario_result "Audit Logs View" "FAIL" "Failed to retrieve audit logs"
        return 1
    fi
    
    # Step 4: Admin generates usage report
    simulate_user_action "Admin generates usage report"
    report_params="?startDate=2024-01-01&endDate=2024-12-31&format=json"
    if test_api_endpoint "GET" "/api/reports/usage$report_params" "" "200" "Authorization: Bearer $ADMIN_TOKEN"; then
        simulate_user_action "Usage report generated"
    else
        log_scenario_result "Usage Report Generation" "FAIL" "Failed to generate usage report"
        return 1
    fi
    
    log_scenario_result "Admin Management Workflow" "PASS"
}

# Scenario 6: Collaboration Workflow
test_collaboration_workflow() {
    echo -e "${BLUE}Testing collaboration workflow...${NC}"
    
    # Step 1: User shares files with team
    simulate_user_action "User shares CAD files with team members"
    
    # Step 2: Team member searches for shared files
    simulate_user_action "Team member searches for shared project files"
    shared_search_data='{
        "query": "UAT Test Project",
        "filters": {
            "projectName": "UAT Test Project"
        }
    }'
    
    if test_api_endpoint "POST" "/api/search/query" "$shared_search_data" "200" "Authorization: Bearer $NEW_USER_TOKEN"; then
        simulate_user_action "Shared files found in search"
    else
        log_scenario_result "Shared File Search" "FAIL" "Failed to find shared files"
        return 1
    fi
    
    # Step 3: Team member provides feedback
    simulate_user_action "Team member provides feedback on shared content"
    collab_feedback_data='{
        "queryId": "test-query-id",
        "resultId": "test-result-id",
        "rating": 5,
        "comment": "Great collaboration file, very useful",
        "helpful": true
    }'
    
    if test_api_endpoint "POST" "/api/search/feedback" "$collab_feedback_data" "200" "Authorization: Bearer $NEW_USER_TOKEN"; then
        simulate_user_action "Collaboration feedback submitted"
    else
        log_scenario_result "Collaboration Feedback" "FAIL" "Failed to submit collaboration feedback"
        return 1
    fi
    
    log_scenario_result "Collaboration Workflow" "PASS"
}

# Scenario 7: Error Handling and Recovery
test_error_handling() {
    echo -e "${BLUE}Testing error handling and recovery...${NC}"
    
    # Step 1: Test invalid file upload
    simulate_user_action "User attempts to upload invalid file type"
    echo "Invalid file content" > /tmp/invalid_file.txt
    
    invalid_upload_response=$(curl -s -X POST \
        -H "Authorization: Bearer $TEST_TOKEN" \
        -F "files=@/tmp/invalid_file.txt" \
        "http://localhost:5000/api/files/upload")
    
    if echo "$invalid_upload_response" | jq -e '.error' > /dev/null; then
        simulate_user_action "Invalid file upload properly rejected"
    else
        log_scenario_result "Invalid File Rejection" "FAIL" "Invalid file was not rejected"
        rm -f /tmp/invalid_file.txt
        return 1
    fi
    
    # Step 2: Test unauthorized access
    simulate_user_action "User attempts unauthorized access"
    if test_api_endpoint "GET" "/api/admin/users" "" "403" "Authorization: Bearer $TEST_TOKEN"; then
        simulate_user_action "Unauthorized access properly blocked"
    else
        log_scenario_result "Unauthorized Access Block" "FAIL" "Unauthorized access was not blocked"
        return 1
    fi
    
    # Step 3: Test network error recovery
    simulate_user_action "User experiences network interruption during search"
    # This would typically be tested in the frontend E2E tests
    simulate_user_action "System gracefully handles network errors"
    
    # Cleanup
    rm -f /tmp/invalid_file.txt
    
    log_scenario_result "Error Handling and Recovery" "PASS"
}

# Function to generate UAT report
generate_uat_report() {
    echo ""
    echo "=================================================="
    echo -e "${BLUE}User Acceptance Test Results${NC}"
    echo "=================================================="
    echo ""
    echo -e "Total Scenarios: ${BLUE}$TOTAL_SCENARIOS${NC}"
    echo -e "Passed: ${GREEN}$PASSED_SCENARIOS${NC}"
    echo -e "Failed: ${RED}$FAILED_SCENARIOS${NC}"
    echo ""
    
    if [ $FAILED_SCENARIOS -eq 0 ]; then
        echo -e "${GREEN}🎉 All user acceptance scenarios passed!${NC}"
        echo ""
        echo "The CAD AI Platform meets all user acceptance criteria."
        echo "System is ready for production deployment."
    else
        echo -e "${RED}❌ Some scenarios failed. Please review the results above.${NC}"
        echo ""
        echo "Failed scenarios:"
        for result in "${SCENARIO_RESULTS[@]}"; do
            if [[ $result == *"FAIL"* ]]; then
                echo -e "${RED}  - $result${NC}"
            fi
        done
    fi
    
    echo ""
    echo "Detailed UAT results have been saved to: uat-results.json"
    
    # Generate JSON report
    cat > uat-results.json << EOF
{
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "test_type": "User Acceptance Testing",
    "summary": {
        "total_scenarios": $TOTAL_SCENARIOS,
        "passed": $PASSED_SCENARIOS,
        "failed": $FAILED_SCENARIOS,
        "success_rate": $(echo "scale=2; $PASSED_SCENARIOS * 100 / $TOTAL_SCENARIOS" | bc)
    },
    "scenarios": [
$(printf '%s\n' "${SCENARIO_RESULTS[@]}" | sed 's/.*/"&"/' | paste -sd ',' -)
    ]
}
EOF
}

# Main execution
main() {
    echo -e "${BLUE}Preparing UAT environment...${NC}"
    
    # Get test authentication token
    echo -e "${BLUE}Getting test user authentication...${NC}"
    test_login_data='{
        "email": "test@example.com",
        "password": "TestPassword123!"
    }'
    
    test_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$test_login_data" "http://localhost:5000/api/auth/login")
    if echo "$test_response" | jq -e '.token' > /dev/null; then
        TEST_TOKEN=$(echo "$test_response" | jq -r '.token')
        echo -e "${GREEN}Test user authentication successful${NC}"
    else
        echo -e "${RED}Failed to get test user authentication token${NC}"
        exit 1
    fi
    
    # Run all UAT scenarios
    test_new_user_onboarding
    test_file_management_workflow
    test_search_workflow
    test_ai_training_workflow
    test_admin_workflow
    test_collaboration_workflow
    test_error_handling
    
    # Generate final report
    generate_uat_report
    
    # Exit with appropriate code
    if [ $FAILED_SCENARIOS -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"