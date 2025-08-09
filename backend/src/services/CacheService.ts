import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
}

export class CacheService {
  private redis: Redis;
  private defaultTTL: number;

  constructor(config: CacheConfig) {
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'cad-ai:',
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.defaultTTL = config.ttl || 3600; // 1 hour default

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;
      await this.redis.setex(key, expiry, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error(`Cache mget error for keys ${keys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      const expiry = ttl || this.defaultTTL;

      Object.entries(keyValuePairs).forEach(([key, value]) => {
        pipeline.setex(key, expiry, JSON.stringify(value));
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        return await this.redis.del(...keys);
      }
      return 0;
    } catch (error) {
      logger.error(`Cache invalidate pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  async increment(key: string, value: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, value);
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.disconnect();
  }

  // Cache key generators for different data types
  static keys = {
    user: (id: string) => `user:${id}`,
    userSessions: (userId: string) => `user:${userId}:sessions`,
    cadFile: (id: string) => `cad-file:${id}`,
    cadFileMetadata: (id: string) => `cad-file:${id}:metadata`,
    cadFileThumbnail: (id: string) => `cad-file:${id}:thumbnail`,
    searchResults: (query: string, filters: string) => `search:${Buffer.from(query + filters).toString('base64')}`,
    aiModel: (id: string) => `ai-model:${id}`,
    dataset: (id: string) => `dataset:${id}`,
    apiResponse: (endpoint: string, params: string) => `api:${endpoint}:${Buffer.from(params).toString('base64')}`,
    userActivity: (userId: string) => `activity:${userId}`,
    systemMetrics: () => 'metrics:system',
    trainingJob: (id: string) => `training:${id}`,
  };
}