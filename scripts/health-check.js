/* This is the health-check script used by the Docker Image
* It's not linted and doesn't have tests as a result.
/*
/* eslint-disable no-console */
const http = require('node:http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  timeout: 2000, // 2 seconds
};

const request = http.request(options, (res) => {
  console.info(`STATUS: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0); // Success
  } else {
    process.exit(1); // Failure
  }
});

request.on('error', (error) => {
  console.error('ERROR:', error.message);
  process.exit(1); // Failure
});

request.end();
