-- Migration: Add encryption support for sensitive data
-- This migration adds encrypted columns and updates existing sensitive data

-- Enable pgcrypto extension for database-level encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted columns for sensitive user data
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_personal_info JSONB;

-- Add encryption metadata for CAD files
ALTER TABLE cad_files ADD COLUMN IF NOT EXISTS encryption_key_id TEXT;
ALTER TABLE cad_files ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE cad_files ADD COLUMN IF NOT EXISTS encryption_algorithm TEXT DEFAULT 'aes-256-gcm';

-- Add encryption tracking table
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id TEXT UNIQUE NOT NULL,
    encrypted_key TEXT NOT NULL, -- Master key encrypted version
    algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    rotation_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add security events table for monitoring
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'encryption_key_rotation', 'unauthorized_access', 'suspicious_activity'
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id UUID REFERENCES users(id),
    resource_type TEXT, -- 'file', 'user_data', 'api_endpoint'
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id)
);

-- Add indexes for security events
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);

-- Add encrypted audit log table
CREATE TABLE IF NOT EXISTS encrypted_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encrypted_data TEXT NOT NULL, -- Encrypted JSON of audit data
    encryption_key_id TEXT NOT NULL,
    checksum TEXT NOT NULL, -- For integrity verification
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Function to encrypt sensitive data at database level
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT, key_material TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(
        pgp_sym_encrypt(data, key_material, 'compress-algo=1, cipher-algo=aes256'),
        'base64'
    );
END;
$$ LANGUAGE plpgsql;

-- Function to decrypt sensitive data at database level
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT, key_material TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(
        decode(encrypted_data, 'base64'),
        key_material
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL; -- Return NULL if decryption fails
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically encrypt sensitive user data
CREATE OR REPLACE FUNCTION encrypt_user_sensitive_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Only encrypt if not already encrypted and data exists
    IF NEW.email IS NOT NULL AND NEW.encrypted_email IS NULL THEN
        NEW.encrypted_email = encrypt_sensitive_data(NEW.email, current_setting('app.encryption_key', true));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user data encryption (disabled by default, enable when needed)
-- DROP TRIGGER IF EXISTS trigger_encrypt_user_data ON users;
-- CREATE TRIGGER trigger_encrypt_user_data
--     BEFORE INSERT OR UPDATE ON users
--     FOR EACH ROW
--     EXECUTE FUNCTION encrypt_user_sensitive_data();

-- Add data retention policies for security events
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    retention_days INTEGER NOT NULL,
    archive_before_delete BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default retention policies
INSERT INTO data_retention_policies (table_name, retention_days, archive_before_delete)
VALUES 
    ('security_events', 365, TRUE),
    ('audit_logs', 2555, TRUE), -- 7 years for compliance
    ('encrypted_audit_logs', 2555, TRUE)
ON CONFLICT DO NOTHING;

-- Add function to clean up old security events
CREATE OR REPLACE FUNCTION cleanup_old_security_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    retention_days INTEGER;
BEGIN
    -- Get retention policy for security events
    SELECT retention_days INTO retention_days
    FROM data_retention_policies
    WHERE table_name = 'security_events';
    
    IF retention_days IS NULL THEN
        retention_days := 365; -- Default to 1 year
    END IF;
    
    -- Delete old security events
    DELETE FROM security_events
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE encryption_keys IS 'Stores encryption key metadata and encrypted keys for data protection';
COMMENT ON TABLE security_events IS 'Logs security-related events for monitoring and alerting';
COMMENT ON TABLE encrypted_audit_logs IS 'Stores encrypted audit logs for sensitive operations';
COMMENT ON FUNCTION encrypt_sensitive_data IS 'Encrypts sensitive data using PostgreSQL pgcrypto';
COMMENT ON FUNCTION decrypt_sensitive_data IS 'Decrypts sensitive data using PostgreSQL pgcrypto';
COMMENT ON FUNCTION cleanup_old_security_events IS 'Removes old security events based on retention policy';