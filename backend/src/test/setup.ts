import { beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment variables if not already set
if (!process.env.DB_NAME) {
  process.env.DB_NAME = 'cad_ai_platform_test';
}

if (!process.env.DB_HOST) {
  process.env.DB_HOST = 'localhost';
}

if (!process.env.DB_PORT) {
  process.env.DB_PORT = '5432';
}

if (!process.env.DB_USER) {
  process.env.DB_USER = 'postgres';
}

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'postgres';
}

// Global test setup
beforeAll(async () => {
  console.log('Setting up test environment...');
});

// Global test teardown
afterAll(async () => {
  console.log('Tearing down test environment...');
});