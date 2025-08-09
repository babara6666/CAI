import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CAD AI Platform API',
      version: '1.0.0',
      description: `
        A comprehensive API for the CAD AI Platform that enables users to upload, manage, and search CAD files using artificial intelligence.
        
        ## Features
        - File upload and management with version control
        - AI-powered search with natural language queries
        - Custom dataset creation and AI model training
        - User management with role-based access control
        - Comprehensive audit logging and reporting
        
        ## Authentication
        This API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:
        \`Authorization: Bearer <your-jwt-token>\`
        
        ## Rate Limiting
        API requests are rate-limited to ensure fair usage:
        - General API: 1000 requests per 15 minutes
        - Authentication: 10 requests per 15 minutes
        - File uploads: 100 requests per hour
        - Search: 60 requests per minute
        - Model training: 5 requests per day
        
        ## Versioning
        The API supports versioning through:
        - URL path: \`/api/v1/endpoint\`
        - Accept header: \`Accept: application/vnd.api+json;version=1.0\`
        - Query parameter: \`?version=1.0\`
      `,
      contact: {
        name: 'CAD AI Platform Support',
        email: 'support@cadai.platform'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:8000',
        description: 'Development server'
      },
      {
        url: 'https://api.cadai.platform',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login'
        }
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Indicates if the request was successful'
            },
            data: {
              type: 'object',
              description: 'Response data (present on success)'
            },
            error: {
              $ref: '#/components/schemas/ApiError'
            },
            pagination: {
              $ref: '#/components/schemas/Pagination'
            }
          },
          required: ['success']
        },
        ApiError: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Error code for programmatic handling'
            },
            message: {
              type: 'string',
              description: 'Human-readable error message'
            },
            details: {
              type: 'object',
              description: 'Additional error details'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'When the error occurred'
            },
            requestId: {
              type: 'string',
              description: 'Unique request identifier for debugging'
            },
            suggestions: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Suggestions for resolving the error'
            }
          },
          required: ['code', 'message', 'timestamp', 'requestId']
        },
        Pagination: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1,
              description: 'Current page number'
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Number of items per page'
            },
            total: {
              type: 'integer',
              minimum: 0,
              description: 'Total number of items'
            },
            totalPages: {
              type: 'integer',
              minimum: 0,
              description: 'Total number of pages'
            }
          },
          required: ['page', 'limit', 'total', 'totalPages']
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            username: {
              type: 'string',
              description: 'User display name'
            },
            role: {
              type: 'string',
              enum: ['admin', 'engineer', 'viewer'],
              description: 'User role determining permissions'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last account update timestamp'
            },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last login timestamp'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the account is active'
            },
            preferences: {
              $ref: '#/components/schemas/UserPreferences'
            }
          },
          required: ['id', 'email', 'username', 'role', 'createdAt', 'updatedAt', 'isActive']
        },
        UserPreferences: {
          type: 'object',
          properties: {
            theme: {
              type: 'string',
              enum: ['light', 'dark'],
              description: 'UI theme preference'
            },
            defaultSearchModel: {
              type: 'string',
              description: 'Default AI model for searches'
            },
            notificationSettings: {
              $ref: '#/components/schemas/NotificationSettings'
            }
          }
        },
        NotificationSettings: {
          type: 'object',
          properties: {
            emailNotifications: {
              type: 'boolean',
              description: 'Enable email notifications'
            },
            trainingComplete: {
              type: 'boolean',
              description: 'Notify when model training completes'
            },
            searchResults: {
              type: 'boolean',
              description: 'Notify about search result improvements'
            },
            systemUpdates: {
              type: 'boolean',
              description: 'Notify about system updates'
            }
          }
        },
        CADFile: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique file identifier'
            },
            filename: {
              type: 'string',
              description: 'Current filename'
            },
            originalName: {
              type: 'string',
              description: 'Original uploaded filename'
            },
            fileSize: {
              type: 'integer',
              description: 'File size in bytes'
            },
            mimeType: {
              type: 'string',
              description: 'MIME type of the file'
            },
            uploadedBy: {
              type: 'string',
              format: 'uuid',
              description: 'ID of user who uploaded the file'
            },
            uploadedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Upload timestamp'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'File tags for categorization'
            },
            projectName: {
              type: 'string',
              description: 'Associated project name'
            },
            partName: {
              type: 'string',
              description: 'Part or component name'
            },
            description: {
              type: 'string',
              description: 'File description'
            },
            metadata: {
              $ref: '#/components/schemas/CADMetadata'
            },
            thumbnailUrl: {
              type: 'string',
              format: 'uri',
              description: 'URL to file thumbnail'
            },
            fileUrl: {
              type: 'string',
              format: 'uri',
              description: 'URL to download the file'
            },
            currentVersion: {
              type: 'integer',
              description: 'Current version number'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          },
          required: ['id', 'filename', 'originalName', 'fileSize', 'mimeType', 'uploadedBy', 'uploadedAt', 'currentVersion']
        },
        CADMetadata: {
          type: 'object',
          properties: {
            dimensions: {
              type: 'object',
              properties: {
                width: { type: 'number' },
                height: { type: 'number' },
                depth: { type: 'number' }
              }
            },
            units: {
              type: 'string',
              description: 'Measurement units (mm, inches, etc.)'
            },
            software: {
              type: 'string',
              description: 'CAD software used to create the file'
            },
            drawingScale: {
              type: 'string',
              description: 'Drawing scale information'
            },
            layerCount: {
              type: 'integer',
              description: 'Number of layers in the CAD file'
            },
            extractedText: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Text extracted from the CAD file'
            }
          }
        },
        Dataset: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string',
              description: 'Dataset name'
            },
            description: {
              type: 'string',
              description: 'Dataset description'
            },
            createdBy: {
              type: 'string',
              format: 'uuid',
              description: 'ID of user who created the dataset'
            },
            fileCount: {
              type: 'integer',
              description: 'Number of files in the dataset'
            },
            status: {
              type: 'string',
              enum: ['creating', 'ready', 'training', 'error'],
              description: 'Dataset status'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          },
          required: ['id', 'name', 'createdBy', 'fileCount', 'status']
        },
        AIModel: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string',
              description: 'Model name'
            },
            description: {
              type: 'string',
              description: 'Model description'
            },
            type: {
              type: 'string',
              enum: ['cnn', 'transformer', 'hybrid'],
              description: 'Model architecture type'
            },
            version: {
              type: 'string',
              description: 'Model version'
            },
            status: {
              type: 'string',
              enum: ['training', 'ready', 'failed', 'deprecated'],
              description: 'Model status'
            },
            performance: {
              $ref: '#/components/schemas/ModelPerformance'
            },
            isDefault: {
              type: 'boolean',
              description: 'Whether this is the default model for searches'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          },
          required: ['id', 'name', 'type', 'version', 'status']
        },
        ModelPerformance: {
          type: 'object',
          properties: {
            accuracy: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Model accuracy score'
            },
            precision: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Model precision score'
            },
            recall: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Model recall score'
            },
            f1Score: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Model F1 score'
            }
          }
        },
        SearchQuery: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text'
            },
            queryType: {
              type: 'string',
              enum: ['natural_language', 'filtered', 'hybrid'],
              description: 'Type of search query'
            },
            filters: {
              $ref: '#/components/schemas/SearchFilters'
            },
            modelId: {
              type: 'string',
              format: 'uuid',
              description: 'AI model to use for search'
            }
          },
          required: ['query']
        },
        SearchFilters: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            projectName: {
              type: 'string'
            },
            partName: {
              type: 'string'
            },
            dateRange: {
              type: 'object',
              properties: {
                startDate: {
                  type: 'string',
                  format: 'date-time'
                },
                endDate: {
                  type: 'string',
                  format: 'date-time'
                }
              }
            },
            fileSize: {
              type: 'object',
              properties: {
                min: {
                  type: 'integer'
                },
                max: {
                  type: 'integer'
                }
              }
            }
          }
        },
        SearchResult: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              format: 'uuid'
            },
            relevanceScore: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Relevance score for the search result'
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence score for the result'
            },
            matchedFeatures: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Features that matched the search query'
            }
          },
          required: ['fileId', 'relevanceScore', 'confidence']
        }
      },
      responses: {
        BadRequest: {
          description: 'Bad Request',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiResponse'
              },
              example: {
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid request data',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  requestId: 'req-123'
                }
              }
            }
          }
        },
        Unauthorized: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiResponse'
              },
              example: {
                success: false,
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Authentication required',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  requestId: 'req-123'
                }
              }
            }
          }
        },
        Forbidden: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiResponse'
              },
              example: {
                success: false,
                error: {
                  code: 'FORBIDDEN',
                  message: 'Insufficient permissions',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  requestId: 'req-123'
                }
              }
            }
          }
        },
        NotFound: {
          description: 'Not Found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiResponse'
              },
              example: {
                success: false,
                error: {
                  code: 'NOT_FOUND',
                  message: 'Resource not found',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  requestId: 'req-123'
                }
              }
            }
          }
        },
        RateLimitExceeded: {
          description: 'Rate Limit Exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiResponse'
              },
              example: {
                success: false,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Too many requests. Please try again later.',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  requestId: 'req-123'
                }
              }
            }
          }
        },
        InternalServerError: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiResponse'
              },
              example: {
                success: false,
                error: {
                  code: 'INTERNAL_SERVER_ERROR',
                  message: 'An internal server error occurred',
                  timestamp: '2024-01-01T00:00:00.000Z',
                  requestId: 'req-123'
                }
              }
            }
          }
        }
      },
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number for pagination',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1
          }
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          }
        },
        VersionParam: {
          name: 'version',
          in: 'query',
          description: 'API version',
          schema: {
            type: 'string',
            pattern: '^[0-9]+\\.[0-9]+$',
            default: '1.0'
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Files',
        description: 'CAD file management and operations'
      },
      {
        name: 'Search',
        description: 'AI-powered search functionality'
      },
      {
        name: 'Datasets',
        description: 'Dataset creation and management'
      },
      {
        name: 'AI Models',
        description: 'AI model training and management'
      },
      {
        name: 'Users',
        description: 'User management (admin only)'
      },
      {
        name: 'Reports',
        description: 'Analytics and reporting'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/*.js'
  ]
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  // Swagger UI setup
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'CAD AI Platform API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      docExpansion: 'none'
    }
  }));

  // JSON endpoint for the OpenAPI spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  console.log('📚 API Documentation available at /api-docs');
};

export { specs };