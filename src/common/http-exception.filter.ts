import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';

import { ResourceExhaustedError } from '../llm/resource-exhausted.error';

/**
 * Interface for Zod validation error details.
 */
interface ZodErrorDetail {
  code: string;
  expected?: string;
  received?: string;
  path: (string | number)[];
  message: string;
}

/**
 * Interface for standardised error details.
 */
interface ErrorDetails {
  status: number;
  message: string;
  errors?: ZodErrorDetail[];
}

/**
 * Interface for the context object passed to the logger.
 */
interface LogContext {
  method: string;
  path: string;
  ip: string | undefined;
  headers: Record<string, string | string[]>;
  userAgent: string | undefined;
}

/**
 * A comprehensive exception filter that catches all errors and formats them
 * into a standardised JSON response. It handles NestJS HttpExceptions,
 * specific Express errors, and any other unknown exceptions.
 */
@Catch()
export class HttpExceptionFilter extends BaseExceptionFilter {
  constructor(private readonly logger: Logger) {
    super();
  }

  /**
   * The main entry point for the exception filter.
   * @param exception - The exception that was thrown.
   * @param host - The arguments host, providing access to request and response.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    // Handle specific Express PayloadTooLargeError separately for clarity.
    if (this.isPayloadTooLargeError(exception)) {
      this.handlePayloadTooLargeError(request, response);
      return;
    }

    // Handle custom ResourceExhaustedError to return 503.
    if (exception instanceof ResourceExhaustedError) {
      this.handleResourceExhaustedError(exception, request, response);
      return;
    }

    // Process HttpException and any other unknown errors.
    const { status, message, errors } = this.getErrorDetails(exception);

    // Sanitise sensitive messages in production for 5xx errors.
    const finalMessage =
      process.env.NODE_ENV === 'production' && status >= 500
        ? 'Internal server error'
        : message;

    this.logError(status, finalMessage, request, exception);
    this.sendResponse(response, status, finalMessage, request.url, errors);
  }

  /**
   * Checks if an exception is an Express 'entity.too.large' error.
   * @param exception - The exception to check.
   * @returns True if the exception is a PayloadTooLargeError.
   */
  private isPayloadTooLargeError(
    exception: unknown,
  ): exception is { type: string } {
    return (
      exception !== null &&
      typeof exception === 'object' &&
      'type' in exception &&
      exception.type === 'entity.too.large'
    );
  }

  /**
   * Handles the specific case of an Express PayloadTooLargeError.
   * @param request - The incoming request object.
   * @param response - The outgoing response object.
   */
  private handlePayloadTooLargeError(
    request: Request,
    response: Response,
  ): void {
    const status = HttpStatus.PAYLOAD_TOO_LARGE;
    const message = 'Payload Too Large';

    this.logError(status, message, request, null); // No exception object needed here
    this.sendResponse(response, status, message, request.url);
  }

  /**
   * Handles the specific case of a ResourceExhaustedError.
   * @param exception - The ResourceExhaustedError instance.
   * @param request - The incoming request object.
   * @param response - The outgoing response object.
   */
  private handleResourceExhaustedError(
    exception: ResourceExhaustedError,
    request: Request,
    response: Response,
  ): void {
    const status = HttpStatus.SERVICE_UNAVAILABLE;
    const message = exception.message;

    this.logError(status, message, request, exception);
    this.sendResponse(response, status, message, request.url);
  }

  /**
   * Extracts error details (status, message, errors) from an exception.
   * @param exception - The exception to process.
   * @returns An object containing the structured error details.
   */
  private getErrorDetails(exception: unknown): ErrorDetails {
    if (exception instanceof HttpException) {
      return this.getHttpExceptionDetails(exception);
    }
    // Fallback for any other type of error.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }

  /**
   * Extracts details specifically from a NestJS HttpException.
   * @param exception - The HttpException instance.
   * @returns An object containing the structured error details.
   */
  private getHttpExceptionDetails(exception: HttpException): ErrorDetails {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    let message: string;
    let errors: ZodErrorDetail[] | undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      // Extract message, which can be a string or an array of strings.
      if ('message' in exceptionResponse) {
        const message_ = (exceptionResponse as { message: string | string[] })
          .message;
        message = Array.isArray(message_) ? message_.join(', ') : message_;
      } else {
        message = 'Internal server error';
      }

      // Extract Zod validation errors if they are present.
      if (
        'errors' in exceptionResponse &&
        Array.isArray(
          (exceptionResponse as { errors: ZodErrorDetail[] }).errors,
        )
      ) {
        errors = (exceptionResponse as { errors: ZodErrorDetail[] }).errors;
      }
    } else {
      message = 'Internal server error';
    }

    return { status, message, errors };
  }

  /**
   * Logs the error with the appropriate level and context.
   * @param status - The HTTP status code of the error.
   * @param message - The error message to log.
   * @param request - The incoming request object.
   * @param exception - The original exception, used for stack traces.
   */
  private logError(
    status: number,
    message: string,
    request: Request,
    exception: unknown,
  ): void {
    const logContext: LogContext = {
      method: request.method,
      path: request.url,
      ip: request.ip,
      headers: this.sanitiseHeaders(request.headers),
      userAgent: request.headers['user-agent'],
    };

    const logMessage = `HTTP ${status} - ${message}`;

    if (status >= 500) {
      this.logger.error(
        logContext,
        logMessage,
        Error.isError(exception) ? exception.stack : undefined,
      );
    } else {
      // Handles 4xx and the specific PayloadTooLargeError case
      this.logger.warn(logContext, logMessage);
    }
  }

  /**
   * Constructs and sends the final JSON error response.
   * @param response - The outgoing response object.
   * @param status - The HTTP status code.
   * @param message - The error message.
   * @param path - The request path.
   * @param errors - Optional array of validation errors.
   */
  private sendResponse(
    response: Response,
    status: number,
    message: string,
    path: string,
    errors?: ZodErrorDetail[],
  ): void {
    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path,
      message,
    };

    if (errors) {
      errorResponse.errors = errors;
    }

    response.status(status).json(errorResponse);
  }

  /**
   * Sanitises request headers to remove sensitive information before logging.
   * @param headers - The original request headers.
   * @returns A new object with redacted headers.
   */
  private sanitiseHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string | string[]> {
    const sanitised = Object.fromEntries(
      Object.entries(headers).filter(
        (entry): entry is [string, string | string[]] => entry[1] !== undefined,
      ),
    ) as Record<string, string | string[]>;

    if ('authorization' in sanitised) sanitised['authorization'] = '[REDACTED]';
    if ('cookie' in sanitised) sanitised['cookie'] = '[REDACTED]';
    if ('x-api-key' in sanitised) sanitised['x-api-key'] = '[REDACTED]';

    return sanitised;
  }
}
