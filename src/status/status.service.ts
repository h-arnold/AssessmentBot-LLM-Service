import * as os from 'node:os';

import { Injectable } from '@nestjs/common';

import * as packageJson from '../../package.json' with { type: 'json' };

/**
 * Interface representing system information for health checks.
 */
interface SystemInfo {
  /** Operating system platform. */
  platform: string;
  /** System architecture. */
  arch: string;
  /** Operating system release version. */
  release: string;
  /** System uptime in seconds. */
  uptime: number;
  /** System hostname. */
  hostname: string;
  /** Total system memory in bytes. */
  totalMemory: number;
  /** Free system memory in bytes. */
  freeMemory: number;
  /** Number of CPU cores. */
  cpus: number;
}

/**
 * Interface representing the complete health check response.
 */
export interface HealthCheckResponse {
  /** Overall application status. */
  status: string;
  /** Application version from package.json. */
  version: string;
  /** ISO timestamp of when the health check was performed. */
  timestamp: string;
  /** Detailed system information. */
  systemInfo: SystemInfo;
}

/**
 * Service providing status and health check functionality for the application.
 *
 * This service offers various endpoints for monitoring application health,
 * testing connectivity, and verifying authentication. It gathers system
 * information and provides diagnostic capabilities for operational monitoring.
 */
@Injectable()
export class StatusService {
  /**
   * Returns a simple greeting message.
   *
   * This method provides a basic connectivity test response that confirms
   * the application is running and responding to requests.
   * @returns {string} A simple "Hello World!" greeting message.
   */
  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Generates a comprehensive health check response.
   *
   * This method collects detailed information about the application and system
   * state, including version information, current timestamp, and system metrics
   * such as memory usage, CPU count, and uptime.
   * @returns {HealthCheckResponse} Complete health check response with
   *   application and system information.
   */
  getHealth(): HealthCheckResponse {
    const now = new Date();
    return {
      status: 'ok',
      version: packageJson.default.version,
      timestamp: now.toISOString(),
      systemInfo: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        hostname: os.hostname(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
      },
    };
  }
}
