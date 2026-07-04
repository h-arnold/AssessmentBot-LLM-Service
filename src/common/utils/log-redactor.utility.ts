// src/common/utils/log-redactor.utility.ts
import { IncomingMessage } from 'node:http';

/**
 * Utility class for redacting sensitive information from log entries.
 *
 * This class provides methods to sanitise HTTP request objects before logging,
 * ensuring that sensitive data such as authorization headers are not exposed
 * in log files.
 */
export const LogRedactor = {
  /**
   * Clones the request object and redacts sensitive headers.
   *
   * Creates a shallow copy of the incoming HTTP request and removes or masks
   * sensitive headers such as authorization tokens to prevent them from
   * appearing in log files.
   *
   * @param request - The incoming HTTP request
   * @returns A cloned and redacted request object safe for logging
   */
redactRequest(request: IncomingMessage): IncomingMessage {
    // Shallow clone the request object
    const clonedRequest = Object.assign({}, request);
    // Clone headers to avoid mutating the original
    clonedRequest.headers = { ...request.headers };
    if (clonedRequest.headers.authorization) {
      clonedRequest.headers.authorization = 'Bearer <redacted>';
    }
    return clonedRequest;
  },
};
