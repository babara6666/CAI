import { AIModel, TrainingJob, ModelConfig, Pagination, InferenceResult } from '../types/index.js';
import { BaseModel } from '../models/BaseModel.js';

export class AIService extends BaseModel {
  async getModels(
    filters: any = {}, 
    options: { page: number; limit: number }
  ): Promise<{ models: AIModel[]; pagination: Pagination }> {
    const { page, limit } = options;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filters.status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }
    
    if (filters.type) {
      whereClause += ` AND type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }
    
    if (filters.isDefault !== undefined) {
      whereClause += ` AND is_default = $${paramIndex}`;
      params.push(filters.isDefault);
      paramIndex++;
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM ai_models ${whereClause}`;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get models
    const modelsQuery = `
      SELECT id, name, description, type, version, training_dataset_id, created_by, 
             created_at, status, performance, config, model_path, is_default
      FROM ai_models 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);
    
    const result = await this.query(modelsQuery, params);
    
    const models: AIModel[] = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      version: row.version,
      trainingDatasetId: row.training_dataset_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      status: row.status,
      performance: row.performance || {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        trainingLoss: 0,
        validationLoss: 0,
        trainingTime: 0,
        inferenceTime: 0
      },
      config: row.config,
      modelPath: row.model_path,
      isDefault: row.is_default
    }));
    
    const pagination: Pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
    
    return { models, pagination };
  }
  
  async getModelById(id: string): Promise<AIModel | null> {
    const query = `
      SELECT id, name, description, type, version, training_dataset_id, created_by, 
             created_at, status, performance, config, model_path, is_default
      FROM ai_models 
      WHERE id = $1
    `;
    
    const result = await this.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      version: row.version,
      trainingDatasetId: row.training_dataset_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      status: row.status,
      performance: row.performance || {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        trainingLoss: 0,
        validationLoss: 0,
        trainingTime: 0,
        inferenceTime: 0
      },
      config: row.config,
      modelPath: row.model_path,
      isDefault: row.is_default
    };
  }
  
  async startTraining(
    datasetId: string, 
    modelConfig: ModelConfig, 
    userId: string
  ): Promise<{ trainingJobId: string; modelId: string; status: string; estimatedDuration: string }> {
    // First, verify the dataset exists and is ready
    const datasetQuery = 'SELECT id, status, file_count FROM datasets WHERE id = $1';
    const datasetResult = await this.query(datasetQuery, [datasetId]);
    
    if (datasetResult.rows.length === 0) {
      throw new Error('Dataset not found');
    }
    
    const dataset = datasetResult.rows[0];
    if (dataset.status !== 'ready') {
      throw new Error('Dataset is not ready for training');
    }
    
    if (dataset.file_count < 10) {
      throw new Error('Dataset must contain at least 10 files for training');
    }
    
    // Create the AI model record
    const modelQuery = `
      INSERT INTO ai_models (name, description, type, version, training_dataset_id, created_by, status, config, model_path, is_default)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    
    const modelPath = `/models/${Date.now()}_${modelConfig.name.replace(/\s+/g, '_').toLowerCase()}`;
    const version = '1.0.0';
    
    const modelResult = await this.query(modelQuery, [
      modelConfig.name,
      modelConfig.description || '',
      modelConfig.type,
      version,
      datasetId,
      userId,
      'training',
      JSON.stringify(modelConfig),
      modelPath,
      false
    ]);
    
    const modelId = modelResult.rows[0].id;
    
    // Create training job record
    const trainingJobQuery = `
      INSERT INTO training_jobs (model_id, dataset_id, status, progress, started_at, created_by)
      VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING id
    `;
    
    const trainingJobResult = await this.query(trainingJobQuery, [
      modelId,
      datasetId,
      'training',
      0,
      userId
    ]);
    
    const trainingJobId = trainingJobResult.rows[0].id;
    
    // Estimate training duration based on dataset size and model complexity
    const estimatedHours = Math.ceil(dataset.file_count / 100) * (modelConfig.trainingConfig.epochs / 10);
    const estimatedDuration = `${estimatedHours} hours`;
    
    // In a real implementation, this would trigger the actual training process
    // For now, we'll simulate it by scheduling a background job
    this.simulateTraining(trainingJobId, modelId, modelConfig.trainingConfig.epochs);
    
    return {
      trainingJobId,
      modelId,
      status: 'training',
      estimatedDuration
    };
  }
  
  async getTrainingJob(jobId: string, userId: string, userRole: string): Promise<TrainingJob | null> {
    let query = `
      SELECT tj.id, tj.model_id, tj.dataset_id, tj.status, tj.progress, tj.metrics,
             tj.started_at, tj.completed_at, tj.error, tj.created_by
      FROM training_jobs tj
      WHERE tj.id = $1
    `;
    
    const params = [jobId];
    
    // Non-admin users can only see their own training jobs
    if (userRole !== 'admin') {
      query += ' AND tj.created_by = $2';
      params.push(userId);
    }
    
    const result = await this.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      modelId: row.model_id,
      datasetId: row.dataset_id,
      status: row.status,
      progress: row.progress || 0,
      metrics: row.metrics || {
        epoch: 0,
        loss: 0,
        accuracy: 0,
        validationLoss: 0,
        validationAccuracy: 0,
        learningRate: 0
      },
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error
    };
  }
  
  async runInference(
    modelId: string, 
    query: string, 
    options: any = {}, 
    userId: string
  ): Promise<{ results: InferenceResult[]; modelInfo: any; inferenceTime: number }> {
    const startTime = Date.now();
    
    // Verify model exists and is ready
    const model = await this.getModelById(modelId);
    if (!model) {
      throw new Error('Model not found');
    }
    
    if (model.status !== 'ready') {
      throw new Error('Model is not ready for inference');
    }
    
    // In a real implementation, this would call the AI service
    // For now, we'll simulate inference results
    const results = await this.simulateInference(query, options);
    
    const inferenceTime = Date.now() - startTime;
    
    // Log the inference request
    await this.logInference(modelId, query, userId, results.length, inferenceTime);
    
    return {
      results,
      modelInfo: {
        modelId: model.id,
        modelName: model.name,
        version: model.version
      },
      inferenceTime
    };
  }
  
  async deleteModel(modelId: string): Promise<boolean> {
    // Check if model is the default model
    const modelQuery = 'SELECT is_default FROM ai_models WHERE id = $1';
    const modelResult = await this.query(modelQuery, [modelId]);
    
    if (modelResult.rows.length === 0) {
      return false;
    }
    
    if (modelResult.rows[0].is_default) {
      throw new Error('Cannot delete the default model');
    }
    
    // Delete the model (this would also clean up associated files)
    const deleteQuery = 'DELETE FROM ai_models WHERE id = $1';
    const result = await this.query(deleteQuery, [modelId]);
    
    return result.rowCount > 0;
  }
  
  async setDefaultModel(modelId: string): Promise<{ success: boolean; previousDefault?: string }> {
    // Verify model exists and is ready
    const model = await this.getModelById(modelId);
    if (!model || model.status !== 'ready') {
      return { success: false };
    }
    
    // Get current default model
    const currentDefaultQuery = 'SELECT id FROM ai_models WHERE is_default = true';
    const currentDefaultResult = await this.query(currentDefaultQuery, []);
    const previousDefault = currentDefaultResult.rows[0]?.id;
    
    // Update default model
    await this.query('BEGIN');
    
    try {
      // Remove default flag from all models
      await this.query('UPDATE ai_models SET is_default = false WHERE is_default = true');
      
      // Set new default model
      await this.query('UPDATE ai_models SET is_default = true WHERE id = $1', [modelId]);
      
      await this.query('COMMIT');
      
      return { success: true, previousDefault };
    } catch (error) {
      await this.query('ROLLBACK');
      throw error;
    }
  }
  
  private async simulateTraining(trainingJobId: string, modelId: string, epochs: number): Promise<void> {
    // This simulates the training process
    // In a real implementation, this would be handled by a background job queue
    
    const updateInterval = 5000; // Update every 5 seconds
    const totalUpdates = epochs;
    let currentEpoch = 0;
    
    const updateProgress = async () => {
      if (currentEpoch >= epochs) {
        // Training complete
        await this.query(`
          UPDATE training_jobs 
          SET status = 'completed', progress = 100, completed_at = NOW(),
              metrics = $1
          WHERE id = $2
        `, [
          JSON.stringify({
            epoch: epochs,
            loss: 0.1,
            accuracy: 0.95,
            validationLoss: 0.12,
            validationAccuracy: 0.93,
            learningRate: 0.001
          }),
          trainingJobId
        ]);
        
        await this.query(`
          UPDATE ai_models 
          SET status = 'ready', performance = $1
          WHERE id = $2
        `, [
          JSON.stringify({
            accuracy: 0.95,
            precision: 0.94,
            recall: 0.96,
            f1Score: 0.95,
            trainingLoss: 0.1,
            validationLoss: 0.12,
            trainingTime: epochs * 60, // Simulated training time
            inferenceTime: 50 // Average inference time in ms
          }),
          modelId
        ]);
        
        return;
      }
      
      currentEpoch++;
      const progress = Math.round((currentEpoch / epochs) * 100);
      
      await this.query(`
        UPDATE training_jobs 
        SET progress = $1, metrics = $2
        WHERE id = $3
      `, [
        progress,
        JSON.stringify({
          epoch: currentEpoch,
          loss: 1.0 - (currentEpoch / epochs) * 0.9,
          accuracy: 0.5 + (currentEpoch / epochs) * 0.45,
          validationLoss: 1.1 - (currentEpoch / epochs) * 0.98,
          validationAccuracy: 0.48 + (currentEpoch / epochs) * 0.45,
          learningRate: 0.001
        }),
        trainingJobId
      ]);
      
      setTimeout(updateProgress, updateInterval);
    };
    
    setTimeout(updateProgress, updateInterval);
  }
  
  private async simulateInference(query: string, options: any): Promise<InferenceResult[]> {
    // This simulates AI inference results
    // In a real implementation, this would call the actual AI service
    
    const maxResults = options.maxResults || 10;
    const threshold = options.threshold || 0.5;
    
    // Simulate finding relevant files
    const filesQuery = `
      SELECT id, filename, tags, metadata
      FROM cad_files 
      WHERE filename ILIKE $1 OR $1 = ANY(tags)
      ORDER BY RANDOM()
      LIMIT $2
    `;
    
    const filesResult = await this.query(filesQuery, [`%${query}%`, maxResults]);
    
    return filesResult.rows.map((row, index) => ({
      fileId: row.id,
      score: Math.max(threshold, Math.random() * (1 - threshold) + threshold),
      features: ['filename_match', 'tag_match', 'content_similarity'],
      metadata: options.includeMetadata ? {
        filename: row.filename,
        tags: row.tags,
        relevanceReason: 'Matched query terms in filename and tags'
      } : {}
    }));
  }
  
  private async logInference(
    modelId: string, 
    query: string, 
    userId: string, 
    resultCount: number, 
    responseTime: number
  ): Promise<void> {
    const logQuery = `
      INSERT INTO search_queries (user_id, query, query_type, model_id, result_count, response_time, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;
    
    await this.query(logQuery, [
      userId,
      query,
      'natural_language',
      modelId,
      resultCount,
      responseTime
    ]);
  }
}