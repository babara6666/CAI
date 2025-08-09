import Bull, { Job, Queue, JobOptions } from 'bull';
import { logger } from '../utils/logger';

export interface JobData {
  type: string;
  payload: any;
  userId?: string;
  priority?: number;
  metadata?: Record<string, any>;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  defaultJobOptions?: JobOptions;
  concurrency?: number;
}

export class JobQueueService {
  private queues: Map<string, Queue> = new Map();
  private processors: Map<string, (job: Job<JobData>) => Promise<JobResult>> = new Map();
  private config: QueueConfig;

  constructor(config: QueueConfig) {
    this.config = config;
    this.setupQueues();
  }

  private setupQueues(): void {
    // File processing queue
    this.createQueue('file-processing', {
      concurrency: 5,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 20,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // AI model training queue
    this.createQueue('ai-training', {
      concurrency: 2, // Limit concurrent training jobs
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 10,
        attempts: 1, // Training jobs shouldn't retry automatically
        timeout: 24 * 60 * 60 * 1000, // 24 hours timeout
      },
    });

    // Search indexing queue
    this.createQueue('search-indexing', {
      concurrency: 3,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000,
        },
      },
    });

    // Email notifications queue
    this.createQueue('notifications', {
      concurrency: 10,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    // Report generation queue
    this.createQueue('reports', {
      concurrency: 2,
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 10,
        attempts: 2,
        timeout: 30 * 60 * 1000, // 30 minutes timeout
      },
    });
  }

  private createQueue(name: string, options: { concurrency: number; defaultJobOptions: JobOptions }): void {
    const queue = new Bull(name, {
      redis: this.config.redis,
      defaultJobOptions: {
        ...this.config.defaultJobOptions,
        ...options.defaultJobOptions,
      },
    });

    // Set up event listeners
    queue.on('completed', (job: Job, result: JobResult) => {
      logger.info(`Job ${job.id} completed in queue ${name}:`, {
        jobType: job.data.type,
        duration: result.duration,
        success: result.success,
      });
    });

    queue.on('failed', (job: Job, error: Error) => {
      logger.error(`Job ${job.id} failed in queue ${name}:`, {
        jobType: job.data.type,
        error: error.message,
        attempts: job.attemptsMade,
      });
    });

    queue.on('stalled', (job: Job) => {
      logger.warn(`Job ${job.id} stalled in queue ${name}:`, {
        jobType: job.data.type,
      });
    });

    // Process jobs with the specified concurrency
    queue.process(options.concurrency, async (job: Job<JobData>) => {
      const processor = this.processors.get(job.data.type);
      if (!processor) {
        throw new Error(`No processor found for job type: ${job.data.type}`);
      }

      const startTime = Date.now();
      try {
        const result = await processor(job);
        result.duration = Date.now() - startTime;
        return result;
      } catch (error) {
        logger.error(`Job processor error for type ${job.data.type}:`, error);
        throw error;
      }
    });

    this.queues.set(name, queue);
  }

  // Register job processor
  registerProcessor(
    jobType: string,
    processor: (job: Job<JobData>) => Promise<JobResult>
  ): void {
    this.processors.set(jobType, processor);
  }

  // Add job to queue
  async addJob(
    queueName: string,
    jobData: JobData,
    options: JobOptions = {}
  ): Promise<Job<JobData>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobData, {
      priority: jobData.priority || 0,
      ...options,
    });

    logger.info(`Job ${job.id} added to queue ${queueName}:`, {
      jobType: jobData.type,
      userId: jobData.userId,
    });

    return job;
  }

  // Get job status
  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      data: job.data,
      progress: job.progress(),
      state: await job.getState(),
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
      attempts: job.attemptsMade,
      failedReason: job.failedReason,
      returnValue: job.returnvalue,
    };
  }

  // Get queue statistics
  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  // Clean old jobs
  async cleanQueue(queueName: string, grace: number = 24 * 60 * 60 * 1000): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    
    logger.info(`Cleaned old jobs from queue ${queueName}`);
  }

  // Pause/Resume queue
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  }

  // Get all queue names and their status
  async getAllQueuesStatus(): Promise<Record<string, any>> {
    const status: Record<string, any> = {};

    for (const [name, queue] of this.queues) {
      const stats = await this.getQueueStats(name);
      const isPaused = await queue.isPaused();
      
      status[name] = {
        ...stats,
        isPaused,
      };
    }

    return status;
  }

  // Shutdown all queues
  async shutdown(): Promise<void> {
    logger.info('Shutting down job queues...');
    
    const shutdownPromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(shutdownPromises);
    
    logger.info('All job queues shut down');
  }
}

// Job processors for different types of background tasks
export class JobProcessors {
  static fileProcessing = async (job: Job<JobData>): Promise<JobResult> => {
    const { type, payload } = job.data;
    
    try {
      switch (type) {
        case 'thumbnail-generation':
          return await JobProcessors.generateThumbnail(job, payload);
        case 'metadata-extraction':
          return await JobProcessors.extractMetadata(job, payload);
        case 'file-validation':
          return await JobProcessors.validateFile(job, payload);
        case 'virus-scan':
          return await JobProcessors.scanForVirus(job, payload);
        default:
          throw new Error(`Unknown file processing job type: ${type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  static aiTraining = async (job: Job<JobData>): Promise<JobResult> => {
    const { type, payload } = job.data;
    
    try {
      switch (type) {
        case 'model-training':
          return await JobProcessors.trainModel(job, payload);
        case 'model-evaluation':
          return await JobProcessors.evaluateModel(job, payload);
        case 'dataset-preprocessing':
          return await JobProcessors.preprocessDataset(job, payload);
        default:
          throw new Error(`Unknown AI training job type: ${type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  static searchIndexing = async (job: Job<JobData>): Promise<JobResult> => {
    const { type, payload } = job.data;
    
    try {
      switch (type) {
        case 'index-file':
          return await JobProcessors.indexFile(job, payload);
        case 'reindex-all':
          return await JobProcessors.reindexAll(job, payload);
        case 'update-search-vectors':
          return await JobProcessors.updateSearchVectors(job, payload);
        default:
          throw new Error(`Unknown search indexing job type: ${type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  // Individual job processor implementations
  private static async generateThumbnail(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(10);
    // Implement thumbnail generation logic
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
    job.progress(100);
    
    return {
      success: true,
      data: { thumbnailUrl: `/thumbnails/${payload.fileId}.jpg` },
    };
  }

  private static async extractMetadata(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(20);
    // Implement metadata extraction logic
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
    job.progress(100);
    
    return {
      success: true,
      data: { metadata: { dimensions: '100x100', format: 'DWG' } },
    };
  }

  private static async validateFile(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(50);
    // Implement file validation logic
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
    job.progress(100);
    
    return {
      success: true,
      data: { isValid: true, fileType: 'CAD' },
    };
  }

  private static async scanForVirus(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(30);
    // Implement virus scanning logic
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate work
    job.progress(100);
    
    return {
      success: true,
      data: { isClean: true, scanResult: 'No threats detected' },
    };
  }

  private static async trainModel(job: Job<JobData>, payload: any): Promise<JobResult> {
    // Simulate model training with progress updates
    for (let i = 0; i <= 100; i += 10) {
      job.progress(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return {
      success: true,
      data: { modelId: payload.modelId, accuracy: 0.95 },
    };
  }

  private static async evaluateModel(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(50);
    await new Promise(resolve => setTimeout(resolve, 2000));
    job.progress(100);
    
    return {
      success: true,
      data: { accuracy: 0.92, precision: 0.89, recall: 0.94 },
    };
  }

  private static async preprocessDataset(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(25);
    await new Promise(resolve => setTimeout(resolve, 3000));
    job.progress(100);
    
    return {
      success: true,
      data: { processedFiles: payload.fileCount, datasetId: payload.datasetId },
    };
  }

  private static async indexFile(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(40);
    await new Promise(resolve => setTimeout(resolve, 1000));
    job.progress(100);
    
    return {
      success: true,
      data: { indexed: true, fileId: payload.fileId },
    };
  }

  private static async reindexAll(job: Job<JobData>, payload: any): Promise<JobResult> {
    const totalFiles = payload.totalFiles || 100;
    
    for (let i = 0; i < totalFiles; i++) {
      job.progress(Math.round((i / totalFiles) * 100));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      success: true,
      data: { reindexedFiles: totalFiles },
    };
  }

  private static async updateSearchVectors(job: Job<JobData>, payload: any): Promise<JobResult> {
    job.progress(60);
    await new Promise(resolve => setTimeout(resolve, 2000));
    job.progress(100);
    
    return {
      success: true,
      data: { updatedVectors: payload.vectorCount },
    };
  }
}