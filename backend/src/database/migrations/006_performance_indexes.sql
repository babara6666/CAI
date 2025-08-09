-- Performance optimization indexes for CAD AI Platform
-- Migration: 006_performance_indexes.sql

-- Users table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_active 
ON users(email) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_active 
ON users(role) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_login 
ON users(last_login_at DESC) WHERE is_active = true;

-- CAD Files table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_uploaded_by_date 
ON cad_files(uploaded_by, uploaded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_project_name 
ON cad_files(project_name) WHERE project_name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_part_name 
ON cad_files(part_name) WHERE part_name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_tags 
ON cad_files USING GIN(tags);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_metadata 
ON cad_files USING GIN(metadata);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_file_size 
ON cad_files(file_size);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_mime_type 
ON cad_files(mime_type);

-- Composite index for common file search patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_files_search_composite 
ON cad_files(uploaded_by, uploaded_at DESC, project_name, part_name);

-- CAD File Versions table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_file_versions_file_version 
ON cad_file_versions(file_id, version_number DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cad_file_versions_uploaded_date 
ON cad_file_versions(uploaded_at DESC);

-- Datasets table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datasets_created_by_date 
ON datasets(created_by, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datasets_status 
ON datasets(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_datasets_tags 
ON datasets USING GIN(tags);

-- Dataset Files junction table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dataset_files_dataset_label 
ON dataset_files(dataset_id, label);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dataset_files_file_dataset 
ON dataset_files(file_id, dataset_id);

-- AI Models table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_models_created_by_date 
ON ai_models(created_by, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_models_status_default 
ON ai_models(status, is_default);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_models_type_status 
ON ai_models(type, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_models_training_dataset 
ON ai_models(training_dataset_id);

-- Search Queries table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_user_timestamp 
ON search_queries(user_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_query_type 
ON search_queries(query_type, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_model_timestamp 
ON search_queries(model_id, timestamp DESC) WHERE model_id IS NOT NULL;

-- Full-text search index for queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_queries_query_text 
ON search_queries USING GIN(to_tsvector('english', query));

-- Search Results table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_results_query_relevance 
ON search_results(query_id, relevance_score DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_results_file_relevance 
ON search_results(file_id, relevance_score DESC);

-- User Feedback table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_feedback_query_rating 
ON user_feedback(query_id, rating);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_feedback_user_timestamp 
ON user_feedback(user_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_feedback_helpful 
ON user_feedback(helpful, timestamp DESC) WHERE helpful = true;

-- Audit Logs table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_timestamp 
ON audit_logs(user_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_action_timestamp 
ON audit_logs(action, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_resource 
ON audit_logs(resource_type, resource_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_ip_timestamp 
ON audit_logs(ip_address, timestamp DESC);

-- Partial index for recent audit logs (last 30 days)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_recent 
ON audit_logs(timestamp DESC, action) 
WHERE timestamp > (CURRENT_TIMESTAMP - INTERVAL '30 days');

-- Training Jobs table indexes (if exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_jobs_status_created 
ON training_jobs(status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_jobs_user_status 
ON training_jobs(created_by, status, created_at DESC);

-- Performance monitoring views
CREATE OR REPLACE VIEW v_file_search_performance AS
SELECT 
    f.id,
    f.filename,
    f.project_name,
    f.part_name,
    f.uploaded_at,
    f.file_size,
    u.username as uploaded_by_username,
    array_length(f.tags, 1) as tag_count,
    (SELECT COUNT(*) FROM search_results sr WHERE sr.file_id = f.id) as search_result_count
FROM cad_files f
JOIN users u ON f.uploaded_by = u.id
WHERE f.uploaded_at > (CURRENT_TIMESTAMP - INTERVAL '90 days');

CREATE OR REPLACE VIEW v_search_performance_metrics AS
SELECT 
    DATE_TRUNC('day', sq.timestamp) as search_date,
    sq.query_type,
    COUNT(*) as query_count,
    AVG(sq.response_time) as avg_response_time,
    AVG(sq.result_count) as avg_result_count,
    COUNT(DISTINCT sq.user_id) as unique_users
FROM search_queries sq
WHERE sq.timestamp > (CURRENT_TIMESTAMP - INTERVAL '30 days')
GROUP BY DATE_TRUNC('day', sq.timestamp), sq.query_type
ORDER BY search_date DESC;

-- Analyze tables for better query planning
ANALYZE users;
ANALYZE cad_files;
ANALYZE cad_file_versions;
ANALYZE datasets;
ANALYZE dataset_files;
ANALYZE ai_models;
ANALYZE search_queries;
ANALYZE search_results;
ANALYZE user_feedback;
ANALYZE audit_logs;

-- Update table statistics
UPDATE pg_stat_user_tables SET n_tup_ins = n_tup_ins WHERE schemaname = 'public';