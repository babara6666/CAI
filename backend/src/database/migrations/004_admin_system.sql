-- Migration: Admin System Tables
-- Description: Create tables for admin dashboard, system monitoring, and user management

-- System Metrics Table
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit VARCHAR(20) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('performance', 'usage', 'error', 'security')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for system_metrics
CREATE INDEX IF NOT EXISTS idx_system_metrics_category ON system_metrics(category);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);

-- Resource Usage Table
CREATE TABLE IF NOT EXISTS resource_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('storage', 'compute', 'api_calls', 'bandwidth')),
    usage_amount BIGINT NOT NULL DEFAULT 0,
    quota_limit BIGINT NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cost DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, resource_type, period_start)
);

-- Create indexes for resource_usage
CREATE INDEX IF NOT EXISTS idx_resource_usage_user_id ON resource_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_usage_type ON resource_usage(resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_usage_period ON resource_usage(period_start, period_end);

-- User Activities Table
CREATE TABLE IF NOT EXISTS user_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    activity_description VARCHAR(500) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for user_activities
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_type ON user_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activities_timestamp ON user_activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_activities_session ON user_activities(session_id);

-- System Alerts Table
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('warning', 'error', 'critical', 'info')),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(100) NOT NULL,
    severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for system_alerts
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_resolved ON system_alerts(is_resolved);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON system_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_system_alerts_source ON system_alerts(source);

-- Add role column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator', 'viewer'));
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    END IF;
END $$;

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all admin tables
DROP TRIGGER IF EXISTS update_system_metrics_updated_at ON system_metrics;
CREATE TRIGGER update_system_metrics_updated_at 
    BEFORE UPDATE ON system_metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resource_usage_updated_at ON resource_usage;
CREATE TRIGGER update_resource_usage_updated_at 
    BEFORE UPDATE ON resource_usage 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_activities_updated_at ON user_activities;
CREATE TRIGGER update_user_activities_updated_at 
    BEFORE UPDATE ON user_activities 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_alerts_updated_at ON system_alerts;
CREATE TRIGGER update_system_alerts_updated_at 
    BEFORE UPDATE ON system_alerts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial resource usage records for existing users
INSERT INTO resource_usage (user_id, resource_type, usage_amount, quota_limit, period_start, period_end)
SELECT 
    u.id,
    rt.resource_type,
    0 as usage_amount,
    CASE 
        WHEN rt.resource_type = 'storage' THEN 10737418240 -- 10GB in bytes
        WHEN rt.resource_type = 'compute' THEN 3600000 -- 1000 hours in milliseconds
        WHEN rt.resource_type = 'api_calls' THEN 10000 -- 10k API calls
        WHEN rt.resource_type = 'bandwidth' THEN 107374182400 -- 100GB in bytes
    END as quota_limit,
    DATE_TRUNC('month', NOW()) as period_start,
    DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second' as period_end
FROM users u
CROSS JOIN (
    VALUES ('storage'), ('compute'), ('api_calls'), ('bandwidth')
) AS rt(resource_type)
WHERE NOT EXISTS (
    SELECT 1 FROM resource_usage ru 
    WHERE ru.user_id = u.id 
    AND ru.resource_type = rt.resource_type 
    AND ru.period_start = DATE_TRUNC('month', NOW())
);

-- Create a view for user management dashboard
CREATE OR REPLACE VIEW admin_user_overview AS
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    u.email_verified,
    u.created_at,
    u.last_login,
    COUNT(cf.id) as total_files,
    COALESCE(SUM(cf.file_size), 0) as total_storage_used,
    COUNT(ua.id) as activity_count_30d
FROM users u
LEFT JOIN cad_files cf ON u.id = cf.user_id
LEFT JOIN user_activities ua ON u.id = ua.user_id AND ua.timestamp >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.email_verified, u.created_at, u.last_login;

-- Create a view for system health dashboard
CREATE OR REPLACE VIEW system_health_overview AS
SELECT 
    (SELECT COUNT(*) FROM users WHERE is_active = true) as active_users,
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM cad_files) as total_files,
    (SELECT COALESCE(SUM(file_size), 0) FROM cad_files) as total_storage,
    (SELECT COUNT(*) FROM system_alerts WHERE is_resolved = false AND created_at >= NOW() - INTERVAL '24 hours') as unresolved_alerts_24h,
    (SELECT COUNT(*) FROM user_activities WHERE timestamp >= NOW() - INTERVAL '24 hours') as activities_24h,
    (SELECT AVG(metric_value) FROM system_metrics WHERE metric_name = 'cpu_usage' AND timestamp >= NOW() - INTERVAL '1 hour') as avg_cpu_usage_1h,
    (SELECT AVG(metric_value) FROM system_metrics WHERE metric_name = 'memory_usage' AND timestamp >= NOW() - INTERVAL '1 hour') as avg_memory_usage_1h;

-- Grant permissions to application user (assuming 'app_user' role exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON system_metrics TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON resource_usage TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_activities TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON system_alerts TO app_user;
        GRANT SELECT ON admin_user_overview TO app_user;
        GRANT SELECT ON system_health_overview TO app_user;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
    END IF;
END $$;