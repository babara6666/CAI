-- CAD AI Platform Database Initialization Script

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS cad_ai_platform;

-- Connect to the database
\c cad_ai_platform;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'viewer');
CREATE TYPE file_status AS ENUM ('uploading', 'processing', 'ready', 'error');
CREATE TYPE dataset_status AS ENUM ('creating', 'ready', 'training', 'error');
CREATE TYPE model_status AS ENUM ('training', 'ready', 'failed', 'deprecated');
CREATE TYPE model_type AS ENUM ('cnn', 'transformer', 'hybrid');
CREATE TYPE query_type AS ENUM ('natural_language', 'filtered', 'hybrid');

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    preferences JSONB DEFAULT '{}'::jsonb
);

-- Create cad_files table
CREATE TABLE cad_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    tags TEXT[] DEFAULT '{}',
    project_name VARCHAR(255),
    part_name VARCHAR(255),
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    thumbnail_url VARCHAR(500),
    file_url VARCHAR(500) NOT NULL,
    current_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create cad_file_versions table
CREATE TABLE cad_file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES cad_files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    change_description TEXT,
    file_url VARCHAR(500) NOT NULL,
    UNIQUE(file_id, version_number)
);

-- Create datasets table
CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    file_count INTEGER DEFAULT 0,
    status dataset_status DEFAULT 'creating',
    tags TEXT[] DEFAULT '{}'
);

-- Create dataset_files junction table
CREATE TABLE dataset_files (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES cad_files(id) ON DELETE CASCADE,
    label VARCHAR(255),
    confidence DECIMAL(5,4),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (dataset_id, file_id)
);

-- Create ai_models table
CREATE TABLE ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type model_type NOT NULL,
    version VARCHAR(50) NOT NULL,
    training_dataset_id UUID REFERENCES datasets(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status model_status DEFAULT 'training',
    performance JSONB DEFAULT '{}'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    model_path VARCHAR(500),
    is_default BOOLEAN DEFAULT false
);

-- Create search_queries table
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    query_type query_type NOT NULL,
    filters JSONB DEFAULT '{}'::jsonb,
    model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time INTEGER, -- in milliseconds
    result_count INTEGER DEFAULT 0
);

-- Create search_results table
CREATE TABLE search_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID NOT NULL REFERENCES search_queries(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES cad_files(id) ON DELETE CASCADE,
    relevance_score DECIMAL(5,4) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    matched_features TEXT[] DEFAULT '{}',
    position INTEGER NOT NULL
);

-- Create user_feedback table
CREATE TABLE user_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID NOT NULL REFERENCES search_queries(id) ON DELETE CASCADE,
    result_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    helpful BOOLEAN,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

CREATE INDEX idx_cad_files_uploaded_by ON cad_files(uploaded_by);
CREATE INDEX idx_cad_files_tags ON cad_files USING GIN(tags);
CREATE INDEX idx_cad_files_project_name ON cad_files(project_name);
CREATE INDEX idx_cad_files_part_name ON cad_files(part_name);
CREATE INDEX idx_cad_files_uploaded_at ON cad_files(uploaded_at);

CREATE INDEX idx_cad_file_versions_file_id ON cad_file_versions(file_id);
CREATE INDEX idx_cad_file_versions_uploaded_at ON cad_file_versions(uploaded_at);

CREATE INDEX idx_datasets_created_by ON datasets(created_by);
CREATE INDEX idx_datasets_status ON datasets(status);
CREATE INDEX idx_datasets_tags ON datasets USING GIN(tags);

CREATE INDEX idx_dataset_files_dataset_id ON dataset_files(dataset_id);
CREATE INDEX idx_dataset_files_file_id ON dataset_files(file_id);

CREATE INDEX idx_ai_models_created_by ON ai_models(created_by);
CREATE INDEX idx_ai_models_status ON ai_models(status);
CREATE INDEX idx_ai_models_is_default ON ai_models(is_default);
CREATE INDEX idx_ai_models_training_dataset_id ON ai_models(training_dataset_id);

CREATE INDEX idx_search_queries_user_id ON search_queries(user_id);
CREATE INDEX idx_search_queries_timestamp ON search_queries(timestamp);
CREATE INDEX idx_search_queries_model_id ON search_queries(model_id);

CREATE INDEX idx_search_results_query_id ON search_results(query_id);
CREATE INDEX idx_search_results_file_id ON search_results(file_id);
CREATE INDEX idx_search_results_relevance_score ON search_results(relevance_score DESC);

CREATE INDEX idx_user_feedback_query_id ON user_feedback(query_id);
CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX idx_user_feedback_rating ON user_feedback(rating);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);

-- Create full-text search indexes
CREATE INDEX idx_cad_files_search ON cad_files USING GIN(to_tsvector('english', filename || ' ' || COALESCE(description, '') || ' ' || COALESCE(part_name, '')));

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cad_files_updated_at BEFORE UPDATE ON cad_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON datasets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE cad_ai_platform TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;