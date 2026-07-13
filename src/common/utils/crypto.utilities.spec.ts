import { z } from 'zod';

import { generateApiKey } from './crypto.utilities.js';

describe('generateApiKey', () => {
  it('output starts with the given prefix', () => {
    const key = generateApiKey('abt_');

    expect(key.startsWith('abt_')).toBe(true);
  });

  it('output body length is 32 and matches base64url format', () => {
    const key = generateApiKey('abt_');
    const body = key.slice('abt_'.length);

    expect(body).toHaveLength(32);
    expect(z.base64url().length(32).safeParse(body).success).toBe(true);
  });

  it('two consecutive calls produce distinct bodies', () => {
    const a = generateApiKey('abt_');
    const b = generateApiKey('abt_');

    expect(a).not.toBe(b);
  });

  it('a custom prefix is honoured', () => {
    const key = generateApiKey('custom_');

    expect(key.startsWith('custom_')).toBe(true);

    const body = key.slice('custom_'.length);

    expect(z.base64url().length(32).safeParse(body).success).toBe(true);
  });
});
