import {
  HttpException,
  HttpStatus,
  Logger,
  ArgumentsHost,
} from '@nestjs/common';
import { Mock, MockInstance } from 'vitest';

import { HttpExceptionFilter } from './http-exception.filter.js';
import { ResourceExhaustedError } from '../llm/resource-exhausted.error.js';

interface JsonErrorResponseBody {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}

/**
 * Create a mock response object that only has a json method.
 * @returns {{ json: () => void }} A mock response object.
 */
function createStatusOnlyResponse(): { json: () => void } {
  return { json: (): void => {} };
}

/**
 * Assert that the mock JSON response matches the expected error body.
 * @param {Mock} mockJson - The mock JSON function.
 * @param {Omit<JsonErrorResponseBody, 'timestamp'>} expectedBody - The expected
 *   error response body (without timestamp).
 */
function expectJsonErrorResponse(
  mockJson: Mock,
  expectedBody: Omit<JsonErrorResponseBody, 'timestamp'>,
): void {
  const firstCall = mockJson.mock.calls[0] as
    [JsonErrorResponseBody] | undefined;

  expect(firstCall).toBeDefined();

  const [responseBody] = firstCall as [JsonErrorResponseBody];

  expect(
    Object.keys(responseBody).toSorted((left, right) =>
      left.localeCompare(right),
    ),
  ).toEqual(['message', 'path', 'statusCode', 'timestamp']);

  expect(responseBody.statusCode).toBe(expectedBody.statusCode);
  expect(responseBody.message).toBe(expectedBody.message);
  expect(responseBody.path).toBe(expectedBody.path);
  expect(responseBody.timestamp).toEqual(expect.any(String));
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    filter = new HttpExceptionFilter(logger);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle ResourceExhaustedError and return 503', () => {
    const resourceExhaustedError = new ResourceExhaustedError(
      'Quota has been exceeded.',
    );
    const mockJson: Mock = vi.fn();
    const mockStatus: Mock = vi
      .fn()
      .mockImplementation(() => ({ json: mockJson }));
    const mockGetResponse: Mock = vi
      .fn()
      .mockImplementation(() => ({ status: mockStatus }));
    const mockGetRequest: Mock = vi.fn().mockImplementation(() => ({
      url: '/test-resource-exhausted',
      method: 'POST',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    }));
    const mockHttpArgumentsHost: Mock = vi.fn().mockImplementation(() => ({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
    }));
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: mockHttpArgumentsHost,
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getType: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    };
    const loggerSpy: MockInstance = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    filter['catch'](resourceExhaustedError, mockArgumentsHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expectJsonErrorResponse(mockJson, {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Quota has been exceeded.',
      path: '/test-resource-exhausted',
    });
    expect(loggerSpy).toHaveBeenCalledWith(
      {
        method: 'POST',
        path: '/test-resource-exhausted',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        userAgent: 'jest',
      },
      `HTTP ${HttpStatus.SERVICE_UNAVAILABLE} - Quota has been exceeded.`,
      expect.any(String),
    );
  });

  it('should handle Express PayloadTooLargeError and return 413', () => {
    // Simulate Express body-parser PayloadTooLargeError
    const payloadTooLargeError = {
      type: 'entity.too.large',
      message: 'request entity too large',
    };
    const mockJson: Mock = vi.fn();
    const mockStatus: Mock = vi
      .fn()
      .mockImplementation(() => ({ json: mockJson }));
    const mockGetResponse: Mock = vi
      .fn()
      .mockImplementation(() => ({ status: mockStatus }));
    const mockGetRequest: Mock = vi.fn().mockImplementation(() => ({
      url: '/test-large',
      method: 'POST',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    }));
    const mockHttpArgumentsHost: Mock = vi.fn().mockImplementation(() => ({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
      getNext: vi.fn(),
    }));
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: mockHttpArgumentsHost,
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getType: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    };
    const loggerSpy: MockInstance = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    filter['catch'](payloadTooLargeError, mockArgumentsHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expectJsonErrorResponse(mockJson, {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'Payload Too Large',
      path: '/test-large',
    });
    expect(loggerSpy).toHaveBeenCalledWith(
      {
        method: 'POST',
        path: '/test-large',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        userAgent: 'jest',
      },
      `HTTP ${HttpStatus.PAYLOAD_TOO_LARGE} - Payload Too Large`,
    );
  });

  it('should format custom error response with timestamp and path', () => {
    // Create a test exception with a custom message and status
    const exception = new HttpException(
      'Test Exception',
      HttpStatus.BAD_REQUEST,
    );
    // Mock the response object's json and status methods
    const mockJson: Mock = vi.fn();
    const mockStatus: Mock = vi.fn().mockImplementation(() => ({
      json: mockJson,
    }));
    // Mock the getResponse method to return the mocked status
    const mockGetResponse: Mock = vi.fn().mockImplementation(() => ({
      status: mockStatus,
    }));
    // Mock the getRequest method to return a fake request object
    const mockGetRequest: Mock = vi.fn().mockImplementation(() => ({
      url: '/test',
      method: 'POST',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    }));
    /**
     * Mocks the `ArgumentsHost` interface for HTTP requests in NestJS unit tests.
     *
     * This mock provides implementations for `getResponse`, `getRequest`, and `getNext` methods,
     * allowing tests to simulate the behavior of the HTTP context within exception filters or interceptors.
     * @returns An object with mocked `getResponse`, `getRequest`, and `getNext` methods.
     */
    const mockHttpArgumentsHost: Mock = vi.fn().mockImplementation(() => ({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
      getNext: vi.fn(() => {}),
    }));
    /**
     * A mock implementation of the NestJS `ArgumentsHost` interface for use in unit tests.
     *
     * This mock provides stubbed methods for switching between HTTP, RPC, and WebSocket contexts,
     * as well as retrieving arguments and context types. The HTTP context is provided by `mockHttpArgumentsHost`.
     *
     * Methods:
     * - `switchToHttp`: Returns the mocked HTTP arguments host.
     * - `getArgByIndex`: Returns `undefined` for any index, typed as generic `T`.
     * - `getArgs`: Returns an empty array, typed as generic `T`.
     * - `getType`: Always returns `'http'` as the context type.
     * - `switchToRpc`: Returns a mock object with stubbed `getData` and `getContext` methods.
     * - `switchToWs`: Returns a mock object with stubbed `getData`, `getClient`, and `getPattern` methods.
     *
     * Useful for simulating the behavior of `ArgumentsHost` in exception filters and other NestJS constructs during testing.
     */
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: mockHttpArgumentsHost,
      getArgByIndex: function <T = unknown>(index: number): T {
        return undefined as T;
      },
      getArgs: function <T extends unknown[] = unknown[]>(): T {
        return [] as unknown as T;
      },
      getType: function <
        TContext extends string = 'http' | 'rpc' | 'ws' | 'graphql',
      >(): TContext {
        return 'http' as TContext;
      },
      switchToRpc: vi.fn(() => ({
        getData: vi.fn(),
        getContext: vi.fn(),
      })),
      switchToWs: vi.fn(() => ({
        getData: vi.fn(),
        getClient: vi.fn(),
        getPattern: vi.fn(),
      })),
    };
    // Call the filter's catch method with the mocked exception and arguments host
    filter['catch'](exception, mockArgumentsHost);
    // Assert that the response was set with the correct status and message
    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expectJsonErrorResponse(mockJson, {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Test Exception',
      path: '/test',
    });
  });

  it('should sanitise sensitive messages in production', () => {
    const exception = new HttpException(
      'Internal database error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const mockJson: Mock = vi.fn();
    const mockStatus: Mock = vi
      .fn()
      .mockImplementation(() => ({ json: mockJson }));
    const mockGetResponse: Mock = vi
      .fn()
      .mockImplementation(() => ({ status: mockStatus }));
    /**
     * Mocks the behavior of a request object for testing purposes.
     *
     * This mock function simulates an HTTP request with predefined properties:
     * - `url`: The request URL (`/test`).
     * - `method`: The HTTP method used (`POST`).
     * - `ip`: The IP address of the requester (`127.0.0.1`).
     * - `headers`: An object containing request headers (with `'user-agent': 'jest'`).
     * @returns An object representing a mock HTTP request.
     */
    const mockGetRequest: Mock = vi.fn().mockImplementation(() => ({
      url: '/test',
      method: 'POST',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    }));
    const mockHttpArgumentsHost: Mock = vi.fn().mockImplementation(() => ({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
      getNext: vi.fn(),
    }));
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: mockHttpArgumentsHost,
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getType: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    };

    const originalNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    filter['catch'](exception, mockArgumentsHost);

    process.env.NODE_ENV = originalNodeEnvironment;

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expectJsonErrorResponse(mockJson, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      path: '/test',
    });
  });

  it('should include request context in logs', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    const mockJson: Mock = vi.fn();
    const mockStatus: Mock = vi
      .fn()
      .mockImplementation(() => ({ json: mockJson }));
    const mockGetResponse: Mock = vi
      .fn()
      .mockImplementation(() => ({ status: mockStatus }));
    const mockGetRequest: Mock = vi.fn().mockImplementation(() => ({
      url: '/not-found',
      method: 'GET',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    }));
    const mockHttpArgumentsHost: Mock = vi.fn().mockImplementation(() => ({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
      getNext: vi.fn(),
    }));
    /**
     * Mock implementation of the `ArgumentsHost` interface used for testing purposes.
     *
     * This mock object provides stubbed methods to simulate the behavior of NestJS's `ArgumentsHost`,
     * allowing for controlled testing of exception filters and other components that depend on the host context.
     * @property {() => mockHttpArgumentsHost} switchToHttp - Mocked method to simulate switching to HTTP context.
     * @property {Mock} getArgByIndex - Vitest mock function to retrieve an argument by index.
     * @property {Mock} getArgs - Vitest mock function to retrieve all arguments.
     * @property {Mock} getType - Vitest mock function to retrieve the type of the context.
     * @property {Mock} switchToRpc - Mocked method to simulate switching to RPC context.
     * @property {Mock} switchToWs - Mocked method to simulate switching to WebSocket context.
     */
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: mockHttpArgumentsHost,
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getType: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    };
    const loggerSpy: MockInstance = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    filter['catch'](exception, mockArgumentsHost);

    expect(loggerSpy).toHaveBeenCalledWith(
      {
        method: 'GET',
        path: '/not-found',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        userAgent: 'jest',
      },
      `HTTP ${HttpStatus.NOT_FOUND} - Not Found`,
    );
  });

  it('should log not found errors with warn level', () => {
    // This test checks that 404 errors are logged with warn level
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    const loggerSpy: MockInstance = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: () => ({
        getRequest: function <T = unknown>(): T {
          // Return a fake request object with required properties
          return {
            url: '/not-found',
            method: 'GET',
            ip: '127.0.0.1',
            headers: { 'user-agent': 'jest' },
          } as T;
        },
        getResponse: function <T = unknown>(): T {
          // Return a fake response object with a status method
          return { status: createStatusOnlyResponse } as T;
        },
        getNext: function <T = unknown>(): T {
          // Return undefined as required by the interface
          return undefined as T;
        },
      }),
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getType: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    };
    // Call the filter's catch method and check that the logger was called with the expected arguments
    filter['catch'](exception, mockArgumentsHost);
    expect(loggerSpy).toHaveBeenCalledWith(
      {
        method: 'GET',
        path: '/not-found',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        userAgent: 'jest',
      },
      `HTTP ${HttpStatus.NOT_FOUND} - Not Found`,
    );
  });

  it('should use error level for 5xx errors', () => {
    // This test checks that 5xx errors are logged with error level
    const exception = new HttpException(
      'Internal server error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const loggerSpy: MockInstance = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const mockArgumentsHost: ArgumentsHost = {
      switchToHttp: () => ({
        getRequest: function <T = unknown>(): T {
          // Return a fake request object with required properties
          return {
            url: '/error',
            method: 'GET',
            ip: '127.0.0.1',
            headers: { 'user-agent': 'jest' },
          } as T;
        },
        getResponse: function <T = unknown>(): T {
          // Return a fake response object with a status method
          return { status: createStatusOnlyResponse } as T;
        },
        getNext: function <T = unknown>(): T {
          // Return undefined as required by the interface
          return undefined as T;
        },
      }),
      getArgByIndex: vi.fn(),
      getArgs: vi.fn(),
      getType: vi.fn(),
      switchToRpc: vi.fn(),
      switchToWs: vi.fn(),
    };
    // Call the filter's catch method and check that the logger was called with the expected arguments
    filter['catch'](exception, mockArgumentsHost);
    expect(loggerSpy).toHaveBeenCalledWith(
      {
        method: 'GET',
        path: '/error',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
        userAgent: 'jest',
      },
      `HTTP ${HttpStatus.INTERNAL_SERVER_ERROR} - Internal server error`,
      expect.any(String), // Accept any stack trace as the third argument
    );
  });
});
