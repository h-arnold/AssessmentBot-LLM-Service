import { readdirSync, readFileSync } from 'node:fs';

process.env.E2E_MOCK_LLM = 'true';

const TEST_APP_ENTRY = 'testing-main.js';

/**
 * Reads a process command line from /proc, returning undefined if the process
 * has already exited.
 * @param {string} entry - The /proc directory entry (a PID).
 * @returns {string | undefined} The NUL-delimited command line, if available.
 */
function readCmdline(entry: string): string | undefined {
  try {
    return readFileSync(`/proc/${entry}/cmdline`, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Best-effort termination of a process by PID.
 * @param {number} pid - The process identifier to terminate.
 */
function terminateProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process has already exited; nothing to clean up.
  }
}

/**
 * Best-effort termination of any lingering E2E application processes left
 * running by a previously crashed or interrupted test run. The E2E harness
 * spawns the application as a child process bound to a fixed port (3001); if
 * that child is orphaned it holds the port and causes EADDRINUSE flakes on the
 * next run. We identify the processes by scanning /proc for a command line that
 * references the test entrypoint.
 */
function killLingeringTestApps(): void {
  let entries: string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    // Best-effort cleanup; never let it interfere with the suite.
    return;
  }

  const selfPid = process.pid;
  for (const entry of entries) {
    if (!/^\d+$/.test(entry) || Number(entry) === selfPid) {
      continue;
    }
    const cmdline = readCmdline(entry);
    if (cmdline && cmdline.includes(TEST_APP_ENTRY)) {
      terminateProcess(Number(entry));
    }
  }
}

// Clear any application instances left running by a previously crashed or
// interrupted run before this run starts, so they cannot hold port 3001 and
// cause EADDRINUSE flakes. Because E2E files run sequentially, this also clears
// any application orphaned by the previous file if its teardown did not.
killLingeringTestApps();
