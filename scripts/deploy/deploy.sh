#!/bin/bash

# CAD AI Platform Deployment Script
# This script handles deployment to different environments

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
LOG_FILE="/var/log/deploy-$(date +%Y%m%d-%H%M%S).log"

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" | tee -a "$LOG_FILE" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" | tee -a "$LOG_FILE" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" | tee -a "$LOG_FILE" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" | tee -a "$LOG_FILE" ;;
    esac
}

# Validate environment
validate_environment() {
    case $ENVIRONMENT in
        staging|production)
            log INFO "Deploying to $ENVIRONMENT environment"
            ;;
        *)
            log ERROR "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log ERROR "Docker is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose >/dev/null 2>&1; then
        log ERROR "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if required environment files exist
    if [ ! -f "$PROJECT_ROOT/.env.$ENVIRONMENT" ]; then
        log ERROR "Environment file .env.$ENVIRONMENT not found"
        exit 1
    fi
    
    # Check if compose file exists
    if [ ! -f "$PROJECT_ROOT/docker-compose.$ENVIRONMENT.yml" ]; then
        log ERROR "Docker Compose file for $ENVIRONMENT not found"
        exit 1
    fi
    
    log INFO "Prerequisites check passed"
}

# Create backup before deployment
create_backup() {
    log INFO "Creating backup before deployment..."
    
    # Create backup directory
    BACKUP_DIR="/backups/pre-deploy-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup database
    if [ "$ENVIRONMENT" = "production" ]; then
        log INFO "Creating database backup..."
        "$PROJECT_ROOT/scripts/backup/backup-database.sh" || {
            log WARN "Database backup failed, continuing with deployment"
        }
    fi
    
    # Backup current Docker images
    log INFO "Tagging current images as backup..."
    docker images --format "table {{.Repository}}:{{.Tag}}" | grep -E "(backend|frontend|ai-service)" | while read -r image; do
        if [ -n "$image" ] && [ "$image" != "REPOSITORY:TAG" ]; then
            backup_tag="backup-$(date +%Y%m%d-%H%M%S)"
            docker tag "$image" "$backup_tag" || true
            log DEBUG "Tagged $image as $backup_tag"
        fi
    done
    
    log INFO "Backup completed"
}

# Pull latest images
pull_images() {
    log INFO "Pulling latest Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Set image tag in environment
    export IMAGE_TAG="$VERSION"
    
    # Pull images
    if docker-compose -f "docker-compose.$ENVIRONMENT.yml" pull; then
        log INFO "Images pulled successfully"
    else
        log ERROR "Failed to pull images"
        exit 1
    fi
}

# Run pre-deployment tests
run_pre_deployment_tests() {
    log INFO "Running pre-deployment tests..."
    
    # Test image integrity
    log INFO "Testing image integrity..."
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" config -q || {
        log ERROR "Docker Compose configuration is invalid"
        exit 1
    }
    
    # Run security scan on images (if tools are available)
    if command -v trivy >/dev/null 2>&1; then
        log INFO "Running security scan..."
        trivy image --exit-code 1 --severity HIGH,CRITICAL "ghcr.io/your-org/cad-ai-platform/backend:$VERSION" || {
            log WARN "Security vulnerabilities found in backend image"
        }
    fi
    
    log INFO "Pre-deployment tests completed"
}

# Deploy services
deploy_services() {
    log INFO "Starting deployment of services..."
    
    cd "$PROJECT_ROOT"
    
    # Load environment variables
    set -a
    source ".env.$ENVIRONMENT"
    set +a
    
    if [ "$ENVIRONMENT" = "production" ]; then
        # Rolling deployment for production
        deploy_production_rolling
    else
        # Standard deployment for staging
        deploy_standard
    fi
}

# Standard deployment (staging)
deploy_standard() {
    log INFO "Performing standard deployment..."
    
    # Stop services
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" down || true
    
    # Start services
    if docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d; then
        log INFO "Services started successfully"
    else
        log ERROR "Failed to start services"
        exit 1
    fi
}

# Rolling deployment (production)
deploy_production_rolling() {
    log INFO "Performing rolling deployment..."
    
    # Deploy backend first
    log INFO "Deploying backend service..."
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d --no-deps backend
    
    # Wait and health check
    sleep 30
    if ! health_check "backend"; then
        log ERROR "Backend deployment failed health check"
        rollback_service "backend"
        exit 1
    fi
    
    # Deploy AI service
    log INFO "Deploying AI service..."
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d --no-deps ai-service celery-worker
    
    # Wait and health check
    sleep 30
    if ! health_check "ai-service"; then
        log ERROR "AI service deployment failed health check"
        rollback_service "ai-service"
        exit 1
    fi
    
    # Deploy frontend last
    log INFO "Deploying frontend service..."
    docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d --no-deps frontend
    
    # Wait and health check
    sleep 30
    if ! health_check "frontend"; then
        log ERROR "Frontend deployment failed health check"
        rollback_service "frontend"
        exit 1
    fi
    
    log INFO "Rolling deployment completed successfully"
}

# Health check function
health_check() {
    local service="$1"
    local max_attempts=10
    local attempt=1
    
    log INFO "Running health check for $service..."
    
    while [ $attempt -le $max_attempts ]; do
        case $service in
            backend)
                if curl -f -s "http://localhost:3001/health" >/dev/null 2>&1; then
                    log INFO "$service health check passed"
                    return 0
                fi
                ;;
            ai-service)
                if curl -f -s "http://localhost:8000/health" >/dev/null 2>&1; then
                    log INFO "$service health check passed"
                    return 0
                fi
                ;;
            frontend)
                if curl -f -s "http://localhost:3000/health" >/dev/null 2>&1; then
                    log INFO "$service health check passed"
                    return 0
                fi
                ;;
        esac
        
        log DEBUG "Health check attempt $attempt/$max_attempts failed for $service"
        sleep 10
        ((attempt++))
    done
    
    log ERROR "Health check failed for $service after $max_attempts attempts"
    return 1
}

# Rollback specific service
rollback_service() {
    local service="$1"
    log WARN "Rolling back $service service..."
    
    # Find backup image
    local backup_image=$(docker images --format "table {{.Repository}}:{{.Tag}}" | grep "backup-" | grep "$service" | head -1)
    
    if [ -n "$backup_image" ]; then
        log INFO "Rolling back to: $backup_image"
        
        # Tag backup as current
        docker tag "$backup_image" "current-$service"
        
        # Restart service with backup image
        docker-compose -f "docker-compose.$ENVIRONMENT.yml" up -d --no-deps "$service"
        
        log INFO "Rollback completed for $service"
    else
        log ERROR "No backup image found for $service"
    fi
}

# Run database migrations
run_migrations() {
    log INFO "Running database migrations..."
    
    if docker-compose -f "docker-compose.$ENVIRONMENT.yml" exec -T backend npm run migrate; then
        log INFO "Database migrations completed successfully"
    else
        log ERROR "Database migrations failed"
        return 1
    fi
}

# Post-deployment verification
post_deployment_verification() {
    log INFO "Running post-deployment verification..."
    
    # Wait for all services to stabilize
    sleep 60
    
    # Run comprehensive health checks
    if ! "$PROJECT_ROOT/scripts/health-check.sh"; then
        log ERROR "Post-deployment health check failed"
        return 1
    fi
    
    # Test critical endpoints
    log INFO "Testing critical endpoints..."
    
    # Test authentication endpoint
    if curl -f -s -X POST "http://localhost/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"invalid","password":"invalid"}' | grep -q "error"; then
        log INFO "Authentication endpoint test passed"
    else
        log ERROR "Authentication endpoint test failed"
        return 1
    fi
    
    # Test file upload endpoint (should require auth)
    if curl -f -s "http://localhost/api/files" | grep -q "Unauthorized\|error"; then
        log INFO "File upload endpoint test passed"
    else
        log ERROR "File upload endpoint test failed"
        return 1
    fi
    
    log INFO "Post-deployment verification completed successfully"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    if [ -n "$WEBHOOK_URL" ]; then
        local color="good"
        local emoji="🚀"
        
        if [ "$status" = "failure" ]; then
            color="danger"
            emoji="❌"
        elif [ "$status" = "warning" ]; then
            color="warning"
            emoji="⚠️"
        fi
        
        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"text\": \"$emoji $message\",
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Version\", \"value\": \"$VERSION\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date)\", \"short\": true}
                    ]
                }]
            }" || true
    fi
}

# Cleanup function
cleanup() {
    log INFO "Cleaning up old images and containers..."
    
    # Remove old backup images (keep last 5)
    docker images --format "table {{.Repository}}:{{.Tag}}" | grep "backup-" | tail -n +6 | while read -r image; do
        if [ -n "$image" ] && [ "$image" != "REPOSITORY:TAG" ]; then
            docker rmi "$image" || true
        fi
    done
    
    # Remove unused images
    docker image prune -f || true
    
    log INFO "Cleanup completed"
}

# Main deployment function
main() {
    log INFO "Starting deployment process..."
    log INFO "Environment: $ENVIRONMENT"
    log INFO "Version: $VERSION"
    
    # Trap errors and send failure notification
    trap 'send_notification "failure" "Deployment failed for $ENVIRONMENT"; exit 1' ERR
    
    validate_environment
    check_prerequisites
    create_backup
    pull_images
    run_pre_deployment_tests
    deploy_services
    
    # Run migrations (only for backend changes)
    if [ "$VERSION" != "latest" ] || [ "$ENVIRONMENT" = "production" ]; then
        run_migrations || {
            log ERROR "Migration failed, but continuing with deployment"
        }
    fi
    
    post_deployment_verification
    cleanup
    
    log INFO "Deployment completed successfully!"
    send_notification "success" "Deployment successful for $ENVIRONMENT"
}

# Show usage
usage() {
    echo "Usage: $0 [ENVIRONMENT] [VERSION]"
    echo ""
    echo "ENVIRONMENT: staging or production (default: staging)"
    echo "VERSION: Docker image tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0 staging"
    echo "  $0 production v1.2.3"
    echo "  $0 staging latest"
}

# Parse command line arguments
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

# Run main function
main "$@"