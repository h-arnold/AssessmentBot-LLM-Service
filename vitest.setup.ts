import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.test.env' });

process.env.GEMINI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.API_KEYS = 'test-api-key';
process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
process.env.LOG_LEVEL = 'debug';
process.env.THROTTLER_TTL = '60';
process.env.UNAUTHENTICATED_THROTTLER_LIMIT = '10';
process.env.AUTHENTICATED_THROTTLER_LIMIT = '50';
