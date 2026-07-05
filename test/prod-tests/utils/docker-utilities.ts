import { spawn } from 'node:child_process';
import http from 'node:http';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a command with arguments and return its output.
 * @param {string} command - The command to run.
 * @param {string[]} arguments_ - The command arguments.
 * @param {{ cwd?: string }} [options] - Optional options.
 * @param {string} [options.cwd] - The working directory for the command.
 * @returns {Promise<CommandResult>} A promise that resolves with the command
 *   result.
 */
export function runCommand(
  command: string,
  arguments_: string[],
  options: { cwd?: string } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      if (code === 0) resolve({ code: code ?? 0, stdout, stderr });
      else
        reject(
          new Error(
            `${command} ${arguments_.join(' ')} failed (code ${code}):\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
          ),
        );
    });
  });
}

/**
 * Wait until an HTTP endpoint returns a success status (< 500).
 * @param {string} url - The URL to poll.
 * @param {number} timeoutMs - The maximum time to wait in milliseconds.
 */
export async function waitForHttp(
  url: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = http.get(url, (response) => {
          if (response.statusCode && response.statusCode < 500) {
            response.resume();
            resolve();
          } else {
            reject(new Error(`Status ${response.statusCode}`));
          }
        });
        request.on('error', reject);
        request.setTimeout(2000, () => request.destroy(new Error('timeout')));
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(
    `Service not ready at ${url} within ${timeoutMs}ms. Last error: ${lastError}`,
  );
}
