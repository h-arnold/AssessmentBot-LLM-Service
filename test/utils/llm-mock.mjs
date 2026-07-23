import { GoogleGenAI } from '@google/genai';
import { Mistral } from '@mistralai/mistralai';

const mockResponse = {
  completeness: { score: 3, reasoning: 'Mocked response for completeness.' },
  accuracy: { score: 3, reasoning: 'Mocked response for accuracy.' },
  spag: { score: 3, reasoning: 'Mocked response for SPaG.' },
};

const mistralMockResponse = {
  completeness: {
    score: 3,
    reasoning: 'Mistral mocked response for completeness.',
  },
  accuracy: { score: 3, reasoning: 'Mistral mocked response for accuracy.' },
  spag: { score: 3, reasoning: 'Mistral mocked response for SPaG.' },
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

// Patch the `chat` property on the Mistral prototype. Unlike the Gemini SDK,
// the Mistral constructor never assigns `this.chat` as an own property — the
// SDK exposes `chat` as a lazy getter on `Mistral.prototype` backed by a
// private `_chat` field. Overriding the prototype getter is therefore
// sufficient; no setter interception is required. The `configurable: true`
// flag is mandatory so this override can replace the SDK's own lazy-getter
// definition. If a future SDK version switches to an own-property assignment,
// this pattern must be revisited (see SPEC product decision #9).
Object.defineProperty(Mistral.prototype, 'chat', {
  configurable: true,
  get() {
    return {
      complete: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(mistralMockResponse),
            },
          },
        ],
      }),
    };
  },
});
