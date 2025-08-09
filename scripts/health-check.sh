#!/bin/bash

# CAD AI Platform Health Check Script
# This script performs comprehensive health checks on all services

set -e

# Configuration
TIMEOUT=30
MAX_RETRIES=3
ENVIRONMENT="${1:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service endpoints
NGINX_URL="http://localhost"
BACKEND_URL="http://localhost:3001"
AI_SERVICE_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"

# Database connection details
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-cadai_prod}"
DB_USER="${DB_USER:-cadai_user}"

# Redis connection details
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local retry=0
    
    log INFO "Checking $name at $url..."
    
    while [ $retry -lt $MAX_RETRIES ]; do
        if response=$(curl -s -w "%{http_code}" -o /dev/null --max-time $TIMEOUT "$url" 2>/dev/null); then
            if [ "$response" = "$expected_status" ]; then
                log INFO "$name is healthy (HTTP $response)"
                return 0
            else
                log WARN "$name returned HTTP $response, expected $expected_status"
            fi
        else
            log WARN "$name is not responding (attempt $((retry + 1))/$MAX_RETRIES)"
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            sleep 5
        fi
    done
    
    log ERROR "$name health check failed after $MAX_RETRIES attempts"
    return 1
}

# Function to check database connectivity
check_database() {
    log INFO "Checking PostgreSQL database connectivity..."
    
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        if PGPASSWORD="$DB_PASSWORD" pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
            log INFO "Database is accessible"
            
            # Test query execution
            if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
                log INFO "Database query execution successful"
                return 0
            else
                log WARN "Database is accessible but query execution failed"
            fi
        else
            log WARN "Database is not accessible (attempt $((retry + 1))/$MAX_RETRIES)"
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            sleep 5
        fi
    done
    
    log ERROR "Database health check failed after $MAX_RETRIES attempts"
    return 1
}

# Function to check Redis connectivity
check_redis() {
    log INFO "Checking Redis connectivity..."
    
    local retry=0
    while [ $retry -lt $MAX_RETRIES ]; do
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
            log INFO "Redis is accessible and responding to ping"
            return 0
        else
            log WARN "Redis is not accessible (attempt $((retry + 1))/$MAX_RETRIES)"
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            sleep 5
        fi
    done
    
    log ERROR "Redis health check failed after $MAX_RETRIES attempts"
    return 1
}

# Function to check Docker containers
check_containers() {
    log INFO "Checking Docker container status..."
    
    local compose_file="docker-compose.${ENVIRONMENT}.yml"
    if [ ! -f "$compose_file" ]; then
        compose_file="docker-compose.yml"
    fi
    
    # Get list of expected services
    local services=$(docker-compose -f "$compose_file" config --services)
    local failed_services=()
    
    for service in $services; do
        local container_status=$(docker-compose -f "$compose_file" ps -q "$service" | xargs docker inspect --format='{{.State.Status}}' 2>/dev/null || echo "not_found")
        
        case $container_status in
            running)
                log INFO "Container $service is running"
                ;;
            exited)
                log ERROR "Container $service has exited"
                failed_services+=("$service")
                ;;
            not_found)
                log ERROR "Container $service not found"
                failed_services+=("$service")
                ;;
            *)
                log WARN "Container $service status: $container_status"
                ;;
        esac
    done
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        log INFO "All containers are running"
        return 0
    else
        log ERROR "Failed containers: ${failed_services[*]}"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    log INFO "Checking disk space..."
    
    local threshold=90
    local usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt "$threshold" ]; then
        log INFO "Disk usage is ${usage}% (threshold: ${threshold}%)"
        return 0
    else
        log ERROR "Disk usage is ${usage}% (exceeds threshold: ${threshold}%)"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    log INFO "Checking memory usage..."
    
    local threshold=90
    local usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [ "$usage" -lt "$threshold" ]; then
        log INFO "Memory usage is ${usage}% (threshold: ${threshold}%)"
        return 0
    else
        log ERROR "Memory usage is ${usage}% (exceeds threshold: ${threshold}%)"
        return 1
    fi
}

# Function to check application-specific endpoints
check_application_endpoints() {
    log INFO "Checking application-specific endpoints..."
    
    # Test authentication endpoint
    log INFO "Testing authentication endpoint..."
    local auth_response=$(curl -s -X POST "$BACKEND_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"invalid","password":"invalid"}' \
        --max-time $TIMEOUT 2>/dev/null || echo "")
    
    if echo "$auth_response" | grep -q "error\|Unauthorized"; then
        log INFO "Authentication endpoint is responding correctly"
    else
        log ERROR "Authentication endpoint is not responding as expected"
        return 1
    fi
    
    # Test file upload endpoint (should require auth)
    log INFO "Testing file upload endpoint..."
    local upload_response=$(curl -s -w "%{http_code}" -o /dev/null "$BACKEND_URL/api/files" --max-time $TIMEOUT 2>/dev/null || echo "000")
    
    if [ "$upload_response" = "401" ] || [ "$upload_response" = "403" ]; then
        log INFO "File upload endpoint is properly protected"
    else
        log ERROR "File upload endpoint returned unexpected status: $upload_response"
        return 1
    fi
    
    # Test AI service health
    if check_http_endpoint "AI Service Health" "$AI_SERVICE_URL/health"; then
        log INFO "AI service health endpoint is working"
    else
        log ERROR "AI service health endpoint failed"
        return 1
    fi
    
    return 0
}

# Function to check SSL certificates (if HTTPS is enabled)
check_ssl_certificates() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log INFO "Checking SSL certificates..."
        
        local domain="${SSL_DOMAIN:-localhost}"
        local cert_info=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
        
        if [ -n "$cert_info" ]; then
            local expiry_date=$(echo "$cert_info" | grep "notAfter" | cut -d= -f2)
            local expiry_timestamp=$(date -d "$expiry_date" +%s 2>/dev/null || echo "0")
            local current_timestamp=$(date +%s)
            local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
            
            if [ "$days_until_expiry" -gt 30 ]; then
                log INFO "SSL certificate is valid for $days_until_expiry more days"
            elif [ "$days_until_expiry" -gt 0 ]; then
                log WARN "SSL certificate expires in $days_until_expiry days"
            else
                log ERROR "SSL certificate has expired"
                return 1
            fi
        else
            log WARN "Could not retrieve SSL certificate information"
        fi
    fi
    
    return 0
}

# Function to generate health report
generate_health_report() {
    local status="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    cat > "/tmp/health-report-$(date +%Y%m%d-%H%M%S).json" << EOF
{
  "timestamp": "$timestamp",
  "environment": "$ENVIRONMENT",
  "overall_status": "$status",
  "checks": {
    "containers": $([ "$container_status" = "0" ] && echo "true" || echo "false"),
    "database": $([ "$database_status" = "0" ] && echo "true" || echo "false"),
    "redis": $([ "$redis_status" = "0" ] && echo "true" || echo "false"),
    "nginx": $([ "$nginx_status" = "0" ] && echo "true" || echo "false"),
    "backend": $([ "$backend_status" = "0" ] && echo "true" || echo "false"),
    "frontend": $([ "$frontend_status" = "0" ] && echo "true" || echo "false"),
    "ai_service": $([ "$ai_service_status" = "0" ] && echo "true" || echo "false"),
    "disk_space": $([ "$disk_status" = "0" ] && echo "true" || echo "false"),
    "memory": $([ "$memory_status" = "0" ] && echo "true" || echo "false"),
    "application_endpoints": $([ "$app_endpoints_status" = "0" ] && echo "true" || echo "false"),
    "ssl_certificates": $([ "$ssl_status" = "0" ] && echo "true" || echo "false")
  }
}
EOF
    
    log INFO "Health report generated: /tmp/health-report-$(date +%Y%m%d-%H%M%S).json"
}

# Main health check function
main() {
    log INFO "Starting comprehensive health check for $ENVIRONMENT environment..."
    
    local overall_status=0
    
    # Run all health checks
    check_containers; container_status=$?
    check_database; database_status=$?
    check_redis; redis_status=$?
    check_http_endpoint "Nginx" "$NGINX_URL/health"; nginx_status=$?
    check_http_endpoint "Backend API" "$BACKEND_URL/health"; backend_status=$?
    check_http_endpoint "Frontend" "$FRONTEND_URL/health"; frontend_status=$?
    check_http_endpoint "AI Service" "$AI_SERVICE_URL/health"; ai_service_status=$?
    check_disk_space; disk_status=$?
    check_memory; memory_status=$?
    check_application_endpoints; app_endpoints_status=$?
    check_ssl_certificates; ssl_status=$?
    
    # Calculate overall status
    if [ $container_status -ne 0 ] || [ $database_status -ne 0 ] || [ $redis_status -ne 0 ] || \
       [ $nginx_status -ne 0 ] || [ $backend_status -ne 0 ] || [ $frontend_status -ne 0 ] || \
       [ $ai_service_status -ne 0 ] || [ $disk_status -ne 0 ] || [ $memory_status -ne 0 ] || \
       [ $app_endpoints_status -ne 0 ] || [ $ssl_status -ne 0 ]; then
        overall_status=1
    fi
    
    # Generate report
    if [ $overall_status -eq 0 ]; then
        generate_health_report "healthy"
        log INFO "All health checks passed! System is healthy."
    else
        generate_health_report "unhealthy"
        log ERROR "Some health checks failed! System requires attention."
    fi
    
    # Send notification if webhook is configured
    if [ -n "$WEBHOOK_URL" ]; then
        local status_text="healthy"
        local emoji="✅"
        
        if [ $overall_status -ne 0 ]; then
            status_text="unhealthy"
            emoji="❌"
        fi
        
        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$emoji Health check completed: System is $status_text\"}" || true
    fi
    
    exit $overall_status
}

# Show usage
usage() {
    echo "Usage: $0 [ENVIRONMENT]"
    echo ""
    echo "ENVIRONMENT: staging or production (default: production)"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 staging"
    echo "  $0 production"
}

# Parse command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main function
main "$@"