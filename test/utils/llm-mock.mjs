import { GoogleGenAI } from '@google/genai';

const mockResponse = {
  completeness: { score: 3, reasoning: 'Mocked response for completeness.' },
  accuracy: { score: 3, reasoning: 'Mocked response for accuracy.' },
  spag: { score: 3, reasoning: 'Mocked response for SPaG.' },
};

// Patch the `models` property on the GoogleGenAI prototype. Because the
// constructor assigns `this.models = new Models(this.apiClient)` as an own
// property, we define both a getter and a silent setter. The setter intercepts
// that constructor assignment, preventing an own property from being created,
// so every subsequent read goes through the getter and returns the mock.
Object.defineProperty(GoogleGenAI.prototype, 'models', {
  configurable: true,
  get() {
    return {
      generateContent: async () => ({
        text: JSON.stringify(mockResponse),
      }),
    };
  },
  set(_value) {
    // The constructor sets `this.models = new Models(...)`. We intercept that
    // assignment here so no own property shadows the prototype getter.
  },
});
