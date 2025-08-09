# Performance Optimization Guide

This document outlines the performance optimizations implemented in the CAD AI Platform backend.

## Overview

The performance optimization system includes:

1. **Redis Caching** - Fast in-memory caching for frequently accessed data
2. **Database Query Optimization** - Proper indexing and query optimization
3. **CDN Integration** - Static asset delivery optimization
4. **API Response Compression** - Gzip/Brotli compression for API responses
5. **Background Job Processing** - Queue-based processing for heavy operations
6. **Performance Monitoring** - Real-time performance metrics and monitoring

## Components

### 1. Cache Service (`CacheService`)

Provides Redis-based caching with:
- Key-value storage with TTL
- Batch operations (mget/mset)
- Pattern-based invalidation
- Connection pooling and error handling

**Usage:**
```typescript
const cacheService = new CacheService({
  host: 'localhost',
  port: 6379,
  ttl: 3600
});

await cacheService.set('user:123', userData, 300);
const user = await cacheService.get('user:123');
```

### 2. Cache Middleware (`CacheMiddleware`)

HTTP middleware for automatic request/response caching:
- Automatic cache key generation
- Conditional caching based on request/response
- Cache invalidation on data changes

**Usage:**
```typescript
app.get('/api/users/:id', 
  cacheMiddleware.cache(cacheConfigs.userData),
  getUserHandler
);
```

### 3. Query Optimization Service (`QueryOptimizationService`)

Database performance optimization:
- Query execution monitoring
- Performance statistics collection
- Slow query detection
- Batch operations support

**Features:**
- Execution time tracking
- Query plan analysis
- Performance recommendations
- Connection pool monitoring

### 4. CDN Service (`CDNService`)

Static asset delivery optimization:
- CloudFront/Cloudflare integration
- Image optimization
- Cache invalidation
- Responsive image generation

### 5. Compression Service (`CompressionService`)

API response optimization:
- Gzip/Brotli compression
- JSON response optimization
- Response size monitoring
- Cache headers management

### 6. Job Queue Service (`JobQueueService`)

Background processing for heavy operations:
- Redis-based job queues
- Multiple queue types (file processing, AI training, etc.)
- Job progress tracking
- Retry mechanisms and error handling

**Queue Types:**
- `file-processing` - File uploads, thumbnails, metadata extraction
- `ai-training` - Model training and evaluation
- `search-indexing` - Search index updates
- `notifications` - Email and push notifications
- `reports` - Report generation

### 7. Performance Monitoring (`PerformanceMonitoringService`)

Real-time performance tracking:
- Metric collection and aggregation
- System resource monitoring
- Performance alerts
- Historical data analysis

## Database Indexes

The following indexes are created for optimal query performance:

### Users Table
- `idx_users_email_active` - Email lookup for active users
- `idx_users_role_active` - Role-based queries
- `idx_users_last_login` - Login activity tracking

### CAD Files Table
- `idx_cad_files_uploaded_by_date` - File listing by user and date
- `idx_cad_files_tags` - GIN index for tag searches
- `idx_cad_files_metadata` - GIN index for metadata searches
- `idx_cad_files_search_composite` - Composite index for common search patterns

### Search Tables
- `idx_search_queries_user_timestamp` - User search history
- `idx_search_queries_query_text` - Full-text search on queries
- `idx_search_results_query_relevance` - Result ranking

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# CDN Configuration
CDN_PROVIDER=cloudfront
CDN_DISTRIBUTION_ID=your_distribution_id
CDN_DOMAIN=https://cdn.example.com

# AWS Configuration (for CDN)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

### Cache Configuration

```typescript
// Cache TTL settings (seconds)
const cacheConfigs = {
  userData: { ttl: 300 },        // 5 minutes
  cadFileMetadata: { ttl: 3600 }, // 1 hour
  searchResults: { ttl: 600 },    // 10 minutes
  aiModelInfo: { ttl: 1800 },     // 30 minutes
  systemMetrics: { ttl: 60 },     // 1 minute
};
```

## Performance Benchmarks

Run performance benchmarks with:

```bash
npm run performance:benchmark
npm run performance:test
```

### Expected Performance Metrics

- **Cache Operations**: >1000 ops/sec
- **Database Queries**: <100ms average response time
- **API Requests**: <500ms average response time
- **File Uploads**: <30s for files up to 100MB
- **Search Queries**: <2s average response time

## Monitoring

### Key Metrics to Monitor

1. **Response Times**
   - API endpoint response times
   - Database query execution times
   - Cache hit/miss ratios

2. **System Resources**
   - Memory usage and heap size
   - CPU utilization
   - Event loop delay

3. **Queue Performance**
   - Job processing times
   - Queue lengths
   - Failed job rates

4. **Cache Performance**
   - Hit/miss ratios
   - Eviction rates
   - Memory usage

### Performance Alerts

Set up alerts for:
- Response times > 2 seconds
- Memory usage > 90%
- Cache hit ratio < 80%
- Queue length > 1000 jobs
- Failed job rate > 5%

## Best Practices

### Caching
- Use appropriate TTL values based on data volatility
- Implement cache warming for critical data
- Use cache invalidation patterns for data consistency
- Monitor cache hit ratios and adjust strategies

### Database
- Use proper indexes for query patterns
- Implement connection pooling
- Use batch operations for bulk data
- Monitor slow queries and optimize

### API Design
- Implement pagination for large datasets
- Use compression for large responses
- Cache static and semi-static data
- Implement proper error handling

### Background Jobs
- Use appropriate queue priorities
- Implement job retry mechanisms
- Monitor job processing times
- Use dead letter queues for failed jobs

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks in cache
   - Monitor object retention
   - Implement proper cleanup

2. **Slow Database Queries**
   - Check query execution plans
   - Verify index usage
   - Optimize query structure

3. **Cache Misses**
   - Verify cache key generation
   - Check TTL settings
   - Monitor cache eviction

4. **Queue Backlog**
   - Increase worker concurrency
   - Optimize job processing
   - Check for failed jobs

### Debug Commands

```bash
# Check cache statistics
redis-cli info stats

# Monitor database performance
psql -c "SELECT * FROM pg_stat_activity;"

# Check queue status
# Access queue dashboard at /admin/queues

# View performance metrics
# Access metrics at /api/admin/performance
```

## Future Improvements

1. **Advanced Caching**
   - Implement cache warming strategies
   - Add cache clustering support
   - Implement cache analytics

2. **Database Optimization**
   - Add query result caching
   - Implement read replicas
   - Add database sharding

3. **CDN Enhancements**
   - Add edge computing support
   - Implement dynamic image optimization
   - Add video streaming optimization

4. **Monitoring**
   - Add distributed tracing
   - Implement custom metrics
   - Add performance regression detection