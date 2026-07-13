import 'reflect-metadata';
import { randomBytes } from 'node:crypto';

import * as dotenv from 'dotenv';

dotenv.config({ path: '.test.env' });

// Generate a valid API key matching the strict format: prefix (abt_) + 32 base64url chars
const testApiKey = 'abt_' + randomBytes(24).base64urlSlice();
process.env.API_KEYS = testApiKey;
process.env.GEMINI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
process.env.LOG_LEVEL = 'debug';
process.env.THROTTLER_TTL = '60';
process.env.UNAUTHENTICATED_THROTTLER_LIMIT = '10';
process.env.AUTHENTICATED_THROTTLER_LIMIT = '50';
