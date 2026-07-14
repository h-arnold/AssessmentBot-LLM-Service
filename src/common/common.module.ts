import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { HttpExceptionFilter } from './http-exception.filter.js';
import { JsonParserUtility } from './json-parser.utility.js';
import { ConfigModule } from '../config/config.module.js';
/**
 * The `CommonModule` is a NestJS module that provides common utilities and filters
 * to be used across the application. It includes the following:
 *
 * - `HttpExceptionFilter`: A filter for handling HTTP exceptions globally.
 * - `JsonParserUtility`: A utility for parsing JSON data.
 *
 * Both `HttpExceptionFilter` and `JsonParserUtility` are provided and exported,
 * making them available for use in other modules that import `CommonModule`.
 */
@Module({
  imports: [ConfigModule, LoggerModule],
  providers: [
    Logger,
    JsonParserUtility,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [Logger, JsonParserUtility],
})
export class CommonModule {}
