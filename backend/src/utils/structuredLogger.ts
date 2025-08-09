import winston from 'winston';
import path from 'path';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

winston.addColors(logColors);

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'backend',
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid,
      ...meta
    };
    
    // Add request context if available
    if (meta.req) {
      logEntry.request = {
        method: meta.req.method,
        url: meta.req.url,
        headers: meta.req.headers,
        ip: meta.req.ip,
        userAgent: meta.req.get('User-Agent')
      };
      delete logEntry.req;
    }
    
    // Add response context if available
    if (meta.res) {
      logEntry.response = {
        statusCode: meta.res.statusCode,
        headers: meta.res.getHeaders()
      };
      delete logEntry.res;
    }
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: structuredFormat,
  defaultMeta: {
    service: 'cad-ai-backend'
  },
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Console transport for development
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat
      })
    ] : [])
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'rejections.log')
    })
  ]
});

// Enhanced logging methods with context
export class StructuredLogger {
  private correlationId?: string;
  private userId?: string;
  private requestId?: string;

  constructor(context?: { correlationId?: string; userId?: string; requestId?: string }) {
    this.correlationId = context?.correlationId;
    this.userId = context?.userId;
    this.requestId = context?.requestId;
  }

  private addContext(meta: any = {}) {
    return {
      ...meta,
      ...(this.correlationId && { correlationId: this.correlationId }),
      ...(this.userId && { userId: this.userId }),
      ...(this.requestId && { requestId: this.requestId })
    };
  }

  info(message: string, meta?: any) {
    logger.info(message, this.addContext(meta));
  }

  error(message: string, meta?: any) {
    logger.error(message, this.addContext(meta));
  }

  warn(message: string, meta?: any) {
    logger.warn(message, this.addContext(meta));
  }

  debug(message: string, meta?: any) {
    logger.debug(message, this.addContext(meta));
  }

  http(message: string, meta?: any) {
    logger.http(message, this.addContext(meta));
  }

  // Performance logging
  performance(operation: string, duration: number, meta?: any) {
    this.info(`Performance: ${operation}`, {
      ...this.addContext(meta),
      performance: {
        operation,
        duration,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Security event logging
  security(event: string, meta?: any) {
    this.warn(`Security Event: ${event}`, {
      ...this.addContext(meta),
      security: {
        event,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Business event logging
  business(event: string, meta?: any) {
    this.info(`Business Event: ${event}`, {
      ...this.addContext(meta),
      business: {
        event,
        timestamp: new Date().toISOString()
      }
    });
  }
}

// Create child logger with context
export const createLogger = (context?: { correlationId?: string; userId?: string; requestId?: string }) => {
  return new StructuredLogger(context);
};

// Export default logger
export { logger };
export default logger;