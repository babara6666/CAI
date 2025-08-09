-- Migration: Add feedback and learning system tables
-- Description: Creates tables for user interactions, A/B testing, and feedback aggregation

-- User interactions table for tracking user behavior
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interaction_type VARCHAR(50) NOT NULL CHECK (interaction_type IN ('search', 'file_view', 'file_download', 'feedback', 'model_training', 'dataset_creation')),
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    metadata JSONB DEFAULT '{}',
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for user interactions
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_type ON user_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_resource ON user_interactions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_timestamp ON user_interactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_interactions_session ON user_interactions(session_id) WHERE session_id IS NOT NULL;

-- A/B tests table
CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    feature VARCHAR(100) NOT NULL,
    traffic_allocation DECIMAL(5,2) NOT NULL DEFAULT 100.00 CHECK (traffic_allocation >= 0 AND traffic_allocation <= 100),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'paused')),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    target_metric VARCHAR(100) NOT NULL,
    minimum_sample_size INTEGER NOT NULL DEFAULT 100,
    confidence_level DECIMAL(5,2) NOT NULL DEFAULT 95.00 CHECK (confidence_level > 0 AND confidence_level < 100),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date > start_date)
);

-- A/B test variants table
CREATE TABLE IF NOT EXISTS ab_test_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    configuration JSONB NOT NULL DEFAULT '{}',
    traffic_percentage DECIMAL(5,2) NOT NULL CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(test_id, name)
);

-- A/B test participants table
CREATE TABLE IF NOT EXISTS ab_test_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255),
    
    UNIQUE(test_id, user_id)
);

-- A/B test metrics table
CREATE TABLE IF NOT EXISTS ab_test_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,4) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for A/B testing tables
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_feature ON ab_tests(feature);
CREATE INDEX IF NOT EXISTS idx_ab_tests_created_by ON ab_tests(created_by);
CREATE INDEX IF NOT EXISTS idx_ab_test_variants_test_id ON ab_test_variants(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_participants_test_user ON ab_test_participants(test_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_participants_variant ON ab_test_participants(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_metrics_test_variant ON ab_test_metrics(test_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_metrics_metric_name ON ab_test_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_ab_test_metrics_timestamp ON ab_test_metrics(timestamp);

-- Add unique constraint to user_feedback table to prevent duplicate feedback
ALTER TABLE user_feedback 
ADD CONSTRAINT unique_user_feedback 
UNIQUE (query_id, result_id, user_id);

-- Add indexes for better performance on user_feedback
CREATE INDEX IF NOT EXISTS idx_user_feedback_query_id ON user_feedback(query_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_result_id ON user_feedback(result_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating ON user_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_user_feedback_timestamp ON user_feedback(timestamp);

-- Create a view for feedback aggregation
CREATE OR REPLACE VIEW feedback_aggregation AS
SELECT 
    sq.model_id,
    COUNT(uf.id) as total_feedback,
    AVG(uf.rating) as average_rating,
    COUNT(CASE WHEN uf.rating = 1 THEN 1 END) as rating_1_count,
    COUNT(CASE WHEN uf.rating = 2 THEN 1 END) as rating_2_count,
    COUNT(CASE WHEN uf.rating = 3 THEN 1 END) as rating_3_count,
    COUNT(CASE WHEN uf.rating = 4 THEN 1 END) as rating_4_count,
    COUNT(CASE WHEN uf.rating = 5 THEN 1 END) as rating_5_count,
    COUNT(CASE WHEN uf.helpful = true THEN 1 END) as helpful_count,
    ROUND(COUNT(CASE WHEN uf.helpful = true THEN 1 END) * 100.0 / COUNT(uf.id), 2) as helpful_percentage,
    DATE_TRUNC('day', uf.timestamp) as feedback_date
FROM user_feedback uf
JOIN search_results sr ON uf.result_id = sr.id
JOIN search_queries sq ON sr.query_id = sq.id
WHERE sq.model_id IS NOT NULL
GROUP BY sq.model_id, DATE_TRUNC('day', uf.timestamp);

-- Create a function to automatically track user interactions
CREATE OR REPLACE FUNCTION track_user_interaction()
RETURNS TRIGGER AS $$
BEGIN
    -- Track search queries
    IF TG_TABLE_NAME = 'search_queries' AND TG_OP = 'INSERT' THEN
        INSERT INTO user_interactions (user_id, interaction_type, resource_type, resource_id, metadata)
        VALUES (NEW.user_id, 'search', 'search_query', NEW.id, 
                jsonb_build_object('query', NEW.query, 'query_type', NEW.query_type, 'result_count', NEW.result_count));
    END IF;
    
    -- Track feedback
    IF TG_TABLE_NAME = 'user_feedback' AND TG_OP = 'INSERT' THEN
        INSERT INTO user_interactions (user_id, interaction_type, resource_type, resource_id, metadata)
        VALUES (NEW.user_id, 'feedback', 'search_result', NEW.result_id,
                jsonb_build_object('rating', NEW.rating, 'helpful', NEW.helpful));
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic interaction tracking
DROP TRIGGER IF EXISTS trigger_track_search_interaction ON search_queries;
CREATE TRIGGER trigger_track_search_interaction
    AFTER INSERT ON search_queries
    FOR EACH ROW EXECUTE FUNCTION track_user_interaction();

DROP TRIGGER IF EXISTS trigger_track_feedback_interaction ON user_feedback;
CREATE TRIGGER trigger_track_feedback_interaction
    AFTER INSERT ON user_feedback
    FOR EACH ROW EXECUTE FUNCTION track_user_interaction();

-- Create a function to clean up old interaction data
CREATE OR REPLACE FUNCTION cleanup_old_interactions(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_interactions 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get model improvement suggestions based on feedback
CREATE OR REPLACE FUNCTION get_model_improvement_suggestions(target_model_id UUID DEFAULT NULL)
RETURNS TABLE (
    model_id UUID,
    suggestion_type TEXT,
    priority TEXT,
    description TEXT,
    expected_improvement DECIMAL,
    total_samples INTEGER,
    average_rating DECIMAL,
    common_issues TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH model_feedback AS (
        SELECT 
            sq.model_id,
            COUNT(uf.id) as total_feedback,
            AVG(uf.rating) as avg_rating,
            COUNT(CASE WHEN uf.rating <= 2 THEN 1 END) as poor_ratings,
            ARRAY_AGG(DISTINCT uf.comment) FILTER (WHERE uf.comment IS NOT NULL AND uf.rating <= 2) as negative_comments
        FROM user_feedback uf
        JOIN search_results sr ON uf.result_id = sr.id
        JOIN search_queries sq ON sr.query_id = sq.id
        WHERE sq.model_id IS NOT NULL 
        AND (target_model_id IS NULL OR sq.model_id = target_model_id)
        AND uf.timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY sq.model_id
        HAVING COUNT(uf.id) >= 10  -- Minimum feedback threshold
    )
    SELECT 
        mf.model_id,
        CASE 
            WHEN mf.avg_rating < 2.5 THEN 'retrain'
            WHEN mf.avg_rating < 3.5 AND mf.poor_ratings > mf.total_feedback * 0.3 THEN 'adjust_parameters'
            WHEN mf.total_feedback < 50 THEN 'add_data'
            ELSE 'feature_engineering'
        END as suggestion_type,
        CASE 
            WHEN mf.avg_rating < 2.0 THEN 'high'
            WHEN mf.avg_rating < 3.0 THEN 'medium'
            ELSE 'low'
        END as priority,
        CASE 
            WHEN mf.avg_rating < 2.5 THEN 'Model performance is significantly below expectations. Consider retraining with improved dataset.'
            WHEN mf.avg_rating < 3.5 THEN 'Model shows inconsistent results. Consider adjusting hyperparameters or training configuration.'
            WHEN mf.total_feedback < 50 THEN 'Insufficient training data may be limiting model performance. Consider expanding the dataset.'
            ELSE 'Model performance is acceptable but could benefit from feature engineering improvements.'
        END as description,
        CASE 
            WHEN mf.avg_rating < 2.5 THEN (4.0 - mf.avg_rating) / 4.0 * 100
            WHEN mf.avg_rating < 3.5 THEN (4.0 - mf.avg_rating) / 4.0 * 50
            ELSE (4.0 - mf.avg_rating) / 4.0 * 25
        END as expected_improvement,
        mf.total_feedback::INTEGER,
        mf.avg_rating,
        mf.negative_comments
    FROM model_feedback mf
    ORDER BY 
        CASE 
            WHEN mf.avg_rating < 2.0 THEN 1
            WHEN mf.avg_rating < 3.0 THEN 2
            ELSE 3
        END,
        mf.avg_rating ASC;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE user_interactions IS 'Tracks all user interactions for behavior analysis and system improvement';
COMMENT ON TABLE ab_tests IS 'Stores A/B test configurations for comparing different model versions or features';
COMMENT ON TABLE ab_test_variants IS 'Defines the different variants being tested in each A/B test';
COMMENT ON TABLE ab_test_participants IS 'Tracks which users are assigned to which test variants';
COMMENT ON TABLE ab_test_metrics IS 'Stores the measured outcomes for each test participant';
COMMENT ON VIEW feedback_aggregation IS 'Aggregated view of user feedback by model and date for easy analysis';
COMMENT ON FUNCTION track_user_interaction() IS 'Automatically tracks user interactions when certain actions occur';
COMMENT ON FUNCTION cleanup_old_interactions(INTEGER) IS 'Removes old interaction data to maintain database performance';
COMMENT ON FUNCTION get_model_improvement_suggestions(UUID) IS 'Analyzes feedback data to suggest model improvements';