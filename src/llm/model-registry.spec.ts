import { describe, it, expect } from 'vitest';

import {
  SUPPORTED_MODELS,
  resolveProvider,
  validateModelName,
} from './model-registry.js';

describe('Model registry', () => {
  // ---------------------------------------------------------------------------
  // SUPPORTED_MODELS structure
  // ---------------------------------------------------------------------------
  describe('SUPPORTED_MODELS', () => {
    it('should be a non-empty readonly array', () => {
      expect(SUPPORTED_MODELS).toBeInstanceOf(Array);
      expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
    });

    it('should contain the expected Gemini prefixes', () => {
      const geminiPrefixes = SUPPORTED_MODELS.filter(
        (entry) => entry.provider === 'gemini',
      ).map((entry) => entry.prefix);
      expect(geminiPrefixes).toContain('gemini-2.5-flash');
      expect(geminiPrefixes).toContain('gemini-2.0-flash');
    });

    it('should contain the expected Mistral prefixes', () => {
      const mistralPrefixes = SUPPORTED_MODELS.filter(
        (entry) => entry.provider === 'mistral',
      ).map((entry) => entry.prefix);
      expect(mistralPrefixes).toContain('mistral-small-latest');
      expect(mistralPrefixes).toContain('pixtral-');
      expect(mistralPrefixes).toContain('open-mistral-');
    });
  });

  // ---------------------------------------------------------------------------
  // resolveProvider
  // ---------------------------------------------------------------------------
  describe('resolveProvider', () => {
    it('resolves gemini-2.5-flash to gemini', () => {
      expect(resolveProvider('gemini-2.5-flash')).toBe('gemini');
    });

    it('resolves gemini-2.5-flash-lite to gemini (prefix match on longer name)', () => {
      expect(resolveProvider('gemini-2.5-flash-lite')).toBe('gemini');
    });

    it('resolves gemini-2.0-flash to gemini', () => {
      expect(resolveProvider('gemini-2.0-flash')).toBe('gemini');
    });

    it('resolves mistral-small-latest to mistral', () => {
      expect(resolveProvider('mistral-small-latest')).toBe('mistral');
    });

    it('resolves pixtral-12b to mistral', () => {
      expect(resolveProvider('pixtral-12b')).toBe('mistral');
    });

    it('resolves open-mistral-nemo to mistral', () => {
      expect(resolveProvider('open-mistral-nemo')).toBe('mistral');
    });

    it('resolves gemini-2.5-flash-new-variant to gemini (prefix match)', () => {
      expect(resolveProvider('gemini-2.5-flash-new-variant')).toBe('gemini');
    });

    it('resolves pixtral-large-latest to mistral', () => {
      expect(resolveProvider('pixtral-large-latest')).toBe('mistral');
    });

    it('throws Error for unknown model name', () => {
      expect(() => resolveProvider('unknown')).toThrow(Error);
    });

    it('is case-sensitive and throws for uppercase model name', () => {
      expect(() => resolveProvider('GEMINI-2.5-FLASH')).toThrow(Error);
    });
  });

  // ---------------------------------------------------------------------------
  // validateModelName
  // ---------------------------------------------------------------------------
  describe('validateModelName', () => {
    it('does not throw for a recognised model name', () => {
      expect(() => validateModelName('mistral-small-latest')).not.toThrow();
    });

    it('throws Error for an unrecognised model name', () => {
      expect(() => validateModelName('gpt-4o')).toThrow(Error);
    });

    it('includes the unrecognised model name in the error message', () => {
      expect(() => validateModelName('gpt-4o')).toThrow(/gpt-4o/);
    });
  });
});
