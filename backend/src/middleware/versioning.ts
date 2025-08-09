import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

export interface VersionedRequest extends Request {
  apiVersion: string;
}

/**
 * API versioning middleware that extracts version from headers or URL
 * Supports both header-based (Accept: application/vnd.api+json;version=1.0) 
 * and URL-based (/api/v1/...) versioning
 */
export const versioningMiddleware = (req: VersionedRequest, res: Response, next: NextFunction) => {
  let version = '1.0'; // Default version

  // Check for version in Accept header
  const acceptHeader = req.headers.accept;
  if (acceptHeader && acceptHeader.includes('version=')) {
    const versionMatch = acceptHeader.match(/version=([0-9]+\.[0-9]+)/);
    if (versionMatch) {
      version = versionMatch[1];
    }
  }

  // Check for version in URL path (e.g., /api/v1/...)
  const urlVersionMatch = req.path.match(/^\/api\/v([0-9]+(?:\.[0-9]+)?)\//);
  if (urlVersionMatch) {
    version = urlVersionMatch[1];
    // Remove version from path for route matching
    req.url = req.url.replace(`/v${version}`, '');
    req.path = req.path.replace(`/v${version}`, '');
  }

  // Check for version in query parameter
  if (req.query.version) {
    version = req.query.version as string;
  }

  // Validate version format
  if (!/^[0-9]+\.[0-9]+$/.test(version)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_API_VERSION',
        message: `Invalid API version format: ${version}. Expected format: x.y (e.g., 1.0, 2.1)`,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        suggestions: ['Use version format like 1.0, 1.1, 2.0', 'Check API documentation for supported versions']
      }
    };
    return res.status(400).json(response);
  }

  // Check if version is supported
  const supportedVersions = ['1.0', '1.1'];
  if (!supportedVersions.includes(version)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'UNSUPPORTED_API_VERSION',
        message: `API version ${version} is not supported`,
        timestamp: new Date(),
        requestId: req.headers['x-request-id'] as string || 'unknown',
        suggestions: [`Supported versions: ${supportedVersions.join(', ')}`, 'Update your client to use a supported version']
      }
    };
    return res.status(400).json(response);
  }

  // Add version to request object
  req.apiVersion = version;

  // Add version to response headers
  res.setHeader('API-Version', version);
  res.setHeader('Supported-Versions', supportedVersions.join(', '));

  next();
};

/**
 * Version-specific route handler wrapper
 * Allows different implementations for different API versions
 */
export const versionedHandler = (handlers: Record<string, any>) => {
  return (req: VersionedRequest, res: Response, next: NextFunction) => {
    const version = req.apiVersion || '1.0';
    const handler = handlers[version] || handlers['default'];
    
    if (!handler) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VERSION_NOT_IMPLEMENTED',
          message: `This endpoint is not implemented for API version ${version}`,
          timestamp: new Date(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };
      return res.status(501).json(response);
    }

    return handler(req, res, next);
  };
};

/**
 * Deprecation warning middleware
 * Adds deprecation headers for older API versions
 */
export const deprecationWarning = (deprecatedVersions: Record<string, { sunset?: string; replacement?: string }>) => {
  return (req: VersionedRequest, res: Response, next: NextFunction) => {
    const version = req.apiVersion || '1.0';
    const deprecationInfo = deprecatedVersions[version];
    
    if (deprecationInfo) {
      res.setHeader('Deprecation', 'true');
      if (deprecationInfo.sunset) {
        res.setHeader('Sunset', deprecationInfo.sunset);
      }
      if (deprecationInfo.replacement) {
        res.setHeader('Replacement-Version', deprecationInfo.replacement);
      }
      
      // Add deprecation warning to response
      res.locals.deprecationWarning = {
        version,
        message: `API version ${version} is deprecated`,
        sunset: deprecationInfo.sunset,
        replacement: deprecationInfo.replacement
      };
    }
    
    next();
  };
};