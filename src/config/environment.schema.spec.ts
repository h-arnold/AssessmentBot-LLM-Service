import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { configSchema, DEFAULT_API_KEY_PREFIX } from './environment.schema.js';

const validBody = randomBytes(24).base64urlSlice();

const validEnvironment = {
  GEMINI_API_KEY: 'dummy-key-for-testing',
};

describe('Environment schema', () => {
  describe('DEFAULT_API_KEY_PREFIX export', () => {
    it('should export DEFAULT_API_KEY_PREFIX as abt_', () => {
      expect(DEFAULT_API_KEY_PREFIX).toBe('abt_');
    });
  });

  describe('API_KEY_PREFIX default', () => {
    it('should default to abt_ when API_KEY_PREFIX is absent', () => {
      const result = configSchema.parse(validEnvironment);
      expect(result.API_KEY_PREFIX).toBe('abt_');
      expect(result.API_KEYS).toBeUndefined();
    });
  });

  describe('API_KEYS strict-format validation', () => {
    it('should accept a single fully-valid key with default prefix', () => {
      const key = `abt_${validBody}`;
      const result = configSchema.parse({ ...validEnvironment, API_KEYS: key });
      expect(result.API_KEYS).toEqual([key]);
    });

    it('should accept multiple comma-separated fully-valid keys', () => {
      const key2 = `abt_${randomBytes(24).base64urlSlice()}`;
      const key3 = `abt_${randomBytes(24).base64urlSlice()}`;
      const result = configSchema.parse({
        ...validEnvironment,
        API_KEYS: `abt_${validBody},${key2},${key3}`,
      });
      expect(result.API_KEYS).toEqual([`abt_${validBody}`, key2, key3]);
    });

    it('should reject a key missing the prefix', () => {
      expect(() =>
        configSchema.parse({
          ...validEnvironment,
          API_KEYS: `ghp_${validBody}`,
        }),
      ).toThrow(z.ZodError);
    });

    it('should reject a key with the prefix but a body of 31 base64url chars', () => {
      const shortBody = validBody.slice(0, 31);
      expect(() =>
        configSchema.parse({
          ...validEnvironment,
          API_KEYS: `abt_${shortBody}`,
        }),
      ).toThrow(z.ZodError);
    });

    it('should reject a key with the prefix but a body containing a non-base64url character', () => {
      const badBody = `${validBody.slice(0, 31)}!`;
      expect(() =>
        configSchema.parse({
          ...validEnvironment,
          API_KEYS: `abt_${badBody}`,
        }),
      ).toThrow(z.ZodError);
    });

    it('should be a no-op when API_KEYS is undefined', () => {
      const result = configSchema.parse(validEnvironment);
      expect(result.API_KEYS).toBeUndefined();
      expect(result.API_KEY_PREFIX).toBe('abt_');
    });
  });

  describe('Custom API_KEY_PREFIX', () => {
    it('should accept a key with the custom prefix', () => {
      const result = configSchema.parse({
        ...validEnvironment,
        API_KEY_PREFIX: 'custom_',
        API_KEYS: `custom_${validBody}`,
      });
      expect(result.API_KEYS).toEqual([`custom_${validBody}`]);
    });

    it('should reject a key with the custom prefix but a bad body', () => {
      expect(() =>
        configSchema.parse({
          ...validEnvironment,
          API_KEY_PREFIX: 'custom_',
          API_KEYS: 'custom_badbody',
        }),
      ).toThrow(z.ZodError);
    });

    it('should reject a key with the default prefix when a custom prefix is configured', () => {
      const otherBody = randomBytes(24).base64urlSlice();
      expect(() =>
        configSchema.parse({
          ...validEnvironment,
          API_KEY_PREFIX: 'custom_',
          API_KEYS: `abt_${otherBody}`,
        }),
      ).toThrow(z.ZodError);
    });
  });
});
