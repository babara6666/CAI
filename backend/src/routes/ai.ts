import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { trainingRateLimit } from '../middleware/rateLimiting.js';
import { AIService } from '../services/AIService.js';
import { validateModelTraining, validateInferenceRequest } from '../validation/aiValidation.js';
import { ApiResponse } from '../types/index.js';

const router = Router();
const aiService = new AIService();

/**
 * @swagger
 * /api/ai/models:
 *   get:
 *     summary: Get all AI models
 *     description: Retrieve a list of all available AI models with their performance metrics
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: status
 *         in: query
 *         description: Filter by model status
 *         schema:
 *           type: string
 *           enum: [training, ready, failed, deprecated]
 *       - name: type
 *         in: query
 *         description: Filter by model type
 *         schema:
 *           type: string
 *           enum: [cnn, transformer, hybrid]
 *       - name: isDefault
 *         in: query
 *         description: Filter by default status
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of AI models retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AIModel'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/models', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.type) filters.type = req.query.type;
    if (req.query.isDefault !== undefined) filters.isDefault = req.query.isDefault === 'true';
    
    const result = await aiService.getModels(filters, { page, limit });
    
    const response: ApiResponse = {
      success: true,
      data: result.models,
      pagination: result.pagination
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MODEL_FETCH_ERROR',
        message: 'Failed to fetch AI models',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/ai/models/{id}:
 *   get:
 *     summary: Get AI model by ID
 *     description: Retrieve detailed information about a specific AI model
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Model ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: AI model retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AIModel'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/models/:id', authenticateToken, async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = await aiService.getModelById(modelId);
    
    if (!model) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: 'AI model not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: model
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MODEL_FETCH_ERROR',
        message: 'Failed to fetch AI model',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/ai/train:
 *   post:
 *     summary: Start model training
 *     description: Initiate training of a new AI model using the specified dataset
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - datasetId
 *               - modelConfig
 *             properties:
 *               datasetId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the dataset to use for training
 *               modelConfig:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: Name for the new model
 *                   description:
 *                     type: string
 *                     description: Description of the model
 *                   type:
 *                     type: string
 *                     enum: [cnn, transformer, hybrid]
 *                     description: Model architecture type
 *                   architecture:
 *                     type: string
 *                     description: Specific architecture configuration
 *                   hyperparameters:
 *                     type: object
 *                     description: Model hyperparameters
 *                   trainingConfig:
 *                     type: object
 *                     properties:
 *                       epochs:
 *                         type: integer
 *                         minimum: 1
 *                         maximum: 1000
 *                       batchSize:
 *                         type: integer
 *                         minimum: 1
 *                         maximum: 512
 *                       learningRate:
 *                         type: number
 *                         minimum: 0.0001
 *                         maximum: 1.0
 *                       validationSplit:
 *                         type: number
 *                         minimum: 0.1
 *                         maximum: 0.5
 *                       earlyStopping:
 *                         type: boolean
 *                       patience:
 *                         type: integer
 *                         minimum: 1
 *     responses:
 *       201:
 *         description: Model training started successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         trainingJobId:
 *                           type: string
 *                           format: uuid
 *                         modelId:
 *                           type: string
 *                           format: uuid
 *                         status:
 *                           type: string
 *                           example: training
 *                         estimatedDuration:
 *                           type: string
 *                           description: Estimated training duration
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
router.post('/train', authenticateToken, trainingRateLimit, validateModelTraining, async (req, res) => {
  try {
    const { datasetId, modelConfig } = req.body;
    const userId = (req as any).user.id;
    
    const trainingJob = await aiService.startTraining(datasetId, modelConfig, userId);
    
    const response: ApiResponse = {
      success: true,
      data: trainingJob
    };
    
    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'TRAINING_START_ERROR',
        message: 'Failed to start model training',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/ai/training/{jobId}:
 *   get:
 *     summary: Get training job status
 *     description: Retrieve the current status and metrics of a training job
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         description: Training job ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Training job status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         modelId:
 *                           type: string
 *                           format: uuid
 *                         datasetId:
 *                           type: string
 *                           format: uuid
 *                         status:
 *                           type: string
 *                           enum: [training, ready, failed, deprecated]
 *                         progress:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 100
 *                           description: Training progress percentage
 *                         metrics:
 *                           type: object
 *                           properties:
 *                             epoch:
 *                               type: integer
 *                             loss:
 *                               type: number
 *                             accuracy:
 *                               type: number
 *                             validationLoss:
 *                               type: number
 *                             validationAccuracy:
 *                               type: number
 *                             learningRate:
 *                               type: number
 *                         startedAt:
 *                           type: string
 *                           format: date-time
 *                         completedAt:
 *                           type: string
 *                           format: date-time
 *                         error:
 *                           type: string
 *                           description: Error message if training failed
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/training/:jobId', authenticateToken, async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    
    const trainingJob = await aiService.getTrainingJob(jobId, userId, userRole);
    
    if (!trainingJob) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'TRAINING_JOB_NOT_FOUND',
          message: 'Training job not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: trainingJob
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'TRAINING_JOB_FETCH_ERROR',
        message: 'Failed to fetch training job',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/ai/inference:
 *   post:
 *     summary: Run model inference
 *     description: Run inference using a trained model to get predictions or search results
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *               - query
 *             properties:
 *               modelId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the model to use for inference
 *               query:
 *                 type: string
 *                 description: Query or input for inference
 *               options:
 *                 type: object
 *                 properties:
 *                   maxResults:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 100
 *                     default: 10
 *                   threshold:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 1
 *                     default: 0.5
 *                     description: Minimum confidence threshold
 *                   includeMetadata:
 *                     type: boolean
 *                     default: false
 *                     description: Include detailed metadata in results
 *     responses:
 *       200:
 *         description: Inference completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         results:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               fileId:
 *                                 type: string
 *                                 format: uuid
 *                               score:
 *                                 type: number
 *                                 minimum: 0
 *                                 maximum: 1
 *                               features:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                               metadata:
 *                                 type: object
 *                         modelInfo:
 *                           type: object
 *                           properties:
 *                             modelId:
 *                               type: string
 *                             modelName:
 *                               type: string
 *                             version:
 *                               type: string
 *                         inferenceTime:
 *                           type: number
 *                           description: Inference time in milliseconds
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/inference', authenticateToken, validateInferenceRequest, async (req, res) => {
  try {
    const { modelId, query, options = {} } = req.body;
    const userId = (req as any).user.id;
    
    const inferenceResult = await aiService.runInference(modelId, query, options, userId);
    
    const response: ApiResponse = {
      success: true,
      data: inferenceResult
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INFERENCE_ERROR',
        message: 'Failed to run model inference',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/ai/models/{id}:
 *   delete:
 *     summary: Delete AI model (admin only)
 *     description: Delete an AI model and its associated files
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Model ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Model deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: Model deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/models/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const modelId = req.params.id;
    const deleted = await aiService.deleteModel(modelId);
    
    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: 'AI model not found',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Model deleted successfully'
      }
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MODEL_DELETE_ERROR',
        message: 'Failed to delete AI model',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/ai/models/{id}/default:
 *   put:
 *     summary: Set model as default (admin only)
 *     description: Set a specific model as the default for search operations
 *     tags: [AI Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Model ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Default model updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: Default model updated successfully
 *                         previousDefault:
 *                           type: string
 *                           format: uuid
 *                           description: ID of the previous default model
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/models/:id/default', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const modelId = req.params.id;
    const result = await aiService.setDefaultModel(modelId);
    
    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: 'AI model not found or not ready',
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Default model updated successfully',
        previousDefault: result.previousDefault
      }
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'DEFAULT_MODEL_UPDATE_ERROR',
        message: 'Failed to update default model',
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    };
    res.status(500).json(response);
  }
});

export default router;