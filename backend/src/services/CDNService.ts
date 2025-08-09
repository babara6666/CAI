import AWS from 'aws-sdk';
import { logger } from '../utils/logger';

export interface CDNConfig {
  provider: 'cloudfront' | 'cloudflare' | 'local';
  distributionId?: string;
  domain?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  cacheTTL?: number;
}

export interface AssetUploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

export class CDNService {
  private cloudfront?: AWS.CloudFront;
  private s3?: AWS.S3;
  private config: CDNConfig;

  constructor(config: CDNConfig) {
    this.config = config;

    if (config.provider === 'cloudfront') {
      AWS.config.update({
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region || 'us-east-1'
      });

      this.cloudfront = new AWS.CloudFront();
      this.s3 = new AWS.S3();
    }
  }

  // Upload asset to CDN
  async uploadAsset(
    key: string, 
    buffer: Buffer, 
    options: AssetUploadOptions = {}
  ): Promise<string> {
    try {
      switch (this.config.provider) {
        case 'cloudfront':
          return await this.uploadToS3(key, buffer, options);
        case 'local':
          return await this.uploadToLocal(key, buffer, options);
        default:
          throw new Error(`Unsupported CDN provider: ${this.config.provider}`);
      }
    } catch (error) {
      logger.error('CDN upload error:', error);
      throw error;
    }
  }

  // Get optimized URL for asset
  getAssetUrl(key: string, options: { width?: number; height?: number; format?: string } = {}): string {
    const baseUrl = this.config.domain || 'https://localhost:3000';
    
    if (this.config.provider === 'cloudfront') {
      let url = `${baseUrl}/${key}`;
      
      // Add image optimization parameters
      const params = new URLSearchParams();
      if (options.width) params.append('w', options.width.toString());
      if (options.height) params.append('h', options.height.toString());
      if (options.format) params.append('f', options.format);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      return url;
    }
    
    return `${baseUrl}/assets/${key}`;
  }

  // Invalidate CDN cache
  async invalidateCache(paths: string[]): Promise<void> {
    try {
      if (this.config.provider === 'cloudfront' && this.cloudfront) {
        const params = {
          DistributionId: this.config.distributionId!,
          InvalidationBatch: {
            Paths: {
              Quantity: paths.length,
              Items: paths.map(path => `/${path}`)
            },
            CallerReference: Date.now().toString()
          }
        };

        const result = await this.cloudfront.createInvalidation(params).promise();
        logger.info('CDN invalidation created:', result.Invalidation?.Id);
      }
    } catch (error) {
      logger.error('CDN invalidation error:', error);
      throw error;
    }
  }

  // Get CDN statistics
  async getStatistics(startDate: Date, endDate: Date): Promise<any> {
    try {
      if (this.config.provider === 'cloudfront' && this.cloudfront) {
        const params = {
          DistributionId: this.config.distributionId!,
          StartTime: startDate,
          EndTime: endDate,
          Granularity: 'HOUR' as const,
          Metrics: ['Requests', 'BytesDownloaded', 'BytesUploaded']
        };

        const result = await this.cloudfront.getDistributionMetrics(params).promise();
        return result;
      }
      
      return null;
    } catch (error) {
      logger.error('CDN statistics error:', error);
      return null;
    }
  }

  // Optimize images for web delivery
  async optimizeImage(
    buffer: Buffer, 
    options: { 
      width?: number; 
      height?: number; 
      quality?: number; 
      format?: 'webp' | 'jpeg' | 'png' 
    } = {}
  ): Promise<Buffer> {
    // This would typically use a service like Sharp or ImageMagick
    // For now, return the original buffer
    // In production, implement actual image optimization
    
    logger.info('Image optimization requested:', options);
    return buffer;
  }

  // Generate responsive image URLs
  generateResponsiveUrls(key: string): Record<string, string> {
    const breakpoints = [320, 640, 768, 1024, 1280, 1920];
    const urls: Record<string, string> = {};
    
    breakpoints.forEach(width => {
      urls[`${width}w`] = this.getAssetUrl(key, { width, format: 'webp' });
    });
    
    return urls;
  }

  // Preload critical assets
  async preloadAssets(keys: string[]): Promise<void> {
    try {
      // This would implement asset preloading logic
      // For example, warming up CDN cache or prefetching to edge locations
      logger.info('Preloading assets:', keys);
      
      if (this.config.provider === 'cloudfront') {
        // Implement CloudFront cache warming
        for (const key of keys) {
          const url = this.getAssetUrl(key);
          // Make HEAD request to warm cache
          // This is a simplified implementation
          logger.debug(`Warming cache for: ${url}`);
        }
      }
    } catch (error) {
      logger.error('Asset preloading error:', error);
    }
  }

  private async uploadToS3(key: string, buffer: Buffer, options: AssetUploadOptions): Promise<string> {
    if (!this.s3) {
      throw new Error('S3 not configured');
    }

    const params = {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: options.contentType || 'application/octet-stream',
      CacheControl: options.cacheControl || `max-age=${this.config.cacheTTL || 86400}`,
      Metadata: options.metadata || {},
      Tagging: options.tags ? Object.entries(options.tags)
        .map(([k, v]) => `${k}=${v}`)
        .join('&') : undefined
    };

    const result = await this.s3.upload(params).promise();
    return result.Location;
  }

  private async uploadToLocal(key: string, buffer: Buffer, options: AssetUploadOptions): Promise<string> {
    const fs = require('fs').promises;
    const path = require('path');
    
    const uploadDir = path.join(process.cwd(), 'uploads', 'assets');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, key);
    await fs.writeFile(filePath, buffer);
    
    return `/assets/${key}`;
  }
}

// CDN middleware for serving optimized assets
export class CDNMiddleware {
  constructor(private cdnService: CDNService) {}

  // Serve optimized images
  serveOptimizedImage() {
    return async (req: any, res: any, next: any) => {
      try {
        const { key } = req.params;
        const { w: width, h: height, f: format, q: quality } = req.query;

        // Check if optimization is requested
        if (width || height || format || quality) {
          const optimizedUrl = this.cdnService.getAssetUrl(key, {
            width: width ? parseInt(width) : undefined,
            height: height ? parseInt(height) : undefined,
            format: format || undefined
          });

          // Redirect to optimized version
          return res.redirect(302, optimizedUrl);
        }

        next();
      } catch (error) {
        logger.error('CDN middleware error:', error);
        next();
      }
    };
  }

  // Add CDN headers
  addCDNHeaders() {
    return (req: any, res: any, next: any) => {
      // Add cache headers for static assets
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        res.set({
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-CDN-Cache': 'HIT',
          'Vary': 'Accept-Encoding'
        });
      }

      next();
    };
  }
}