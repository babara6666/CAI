-- Migration: Add training jobs table for AI model training tracking
-- This migration adds support for tracking AI model training jobs

CREATE TABLE IF NOT EXISTS training_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'training' CHECK (status IN ('training', 'completed', 'failed', 'cancelled')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    metrics JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_training_jobs_model_id ON training_jobs(model_id);
CREATE INDEX IF NOT EXISTS idx_training_jobs_dataset_id ON training_jobs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_training_jobs_status ON training_jobs(status);
CREATE INDEX IF NOT EXISTS idx_training_jobs_created_by ON training_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_training_jobs_started_at ON training_jobs(started_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_training_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_training_jobs_updated_at
    BEFORE UPDATE ON training_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_training_jobs_updated_at();

-- Add comments for documentation
COMMENT ON TABLE training_jobs IS 'Tracks AI model training jobs and their progress';
COMMENT ON COLUMN training_jobs.id IS 'Unique identifier for the training job';
COMMENT ON COLUMN training_jobs.model_id IS 'Reference to the AI model being trained';
COMMENT ON COLUMN training_jobs.dataset_id IS 'Reference to the dataset used for training';
COMMENT ON COLUMN training_jobs.status IS 'Current status of the training job';
COMMENT ON COLUMN training_jobs.progress IS 'Training progress percentage (0-100)';
COMMENT ON COLUMN training_jobs.metrics IS 'Training metrics (loss, accuracy, etc.) in JSON format';
COMMENT ON COLUMN training_jobs.started_at IS 'When the training job started';
COMMENT ON COLUMN training_jobs.completed_at IS 'When the training job completed (if applicable)';
COMMENT ON COLUMN training_jobs.error IS 'Error message if training failed';
COMMENT ON COLUMN training_jobs.created_by IS 'User who initiated the training job';