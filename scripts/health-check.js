/* This is the health-check script used by the Docker Image.
 * It's not linted and doesn't have tests as a result.
 */
import http from 'node:http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  timeout: 2000, // 2 seconds
};

const request = http.request(options, (response) => {
  console.info(`STATUS: ${response.statusCode}`);
  if (response.statusCode !== 200) {
    process.exitCode = 1; // Failure
  }
});

request.on('error', (error) => {
  console.error('ERROR:', error.message);
  process.exitCode = 1; // Failure
});

request.end();
