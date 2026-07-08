import { IncomingMessage } from 'node:http';

import { LogRedactor } from './log-redactor.utility.js';

describe('LogRedactor', () => {
  it('redacts authorisation headers without mutating the original request', () => {
    const request = {
      headers: {
        authorization: 'Bearer secret-token',
        'x-request-id': 'request-id',
      },
    } as IncomingMessage;

    const redacted = LogRedactor.redactRequest(request);

    expect(redacted).not.toBe(request);
    expect(redacted.headers).not.toBe(request.headers);
    expect(redacted.headers.authorization).toBe('Bearer <redacted>');
    expect(request.headers.authorization).toBe('Bearer secret-token');
  });

  it('keeps headers unchanged when no authorisation header exists', () => {
    const request = {
      headers: {
        'x-request-id': 'request-id',
      },
    } as IncomingMessage;

    const redacted = LogRedactor.redactRequest(request);

    expect(redacted.headers.authorization).toBeUndefined();
    expect(redacted.headers['x-request-id']).toBe('request-id');
  });
});
