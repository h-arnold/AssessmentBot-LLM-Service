import { GoogleGenAI } from '@google/genai';
import { Mistral } from '@mistralai/mistralai';

/**
 * Realistic mock responses for the mocked E2E suites.
 *
 * These were captured from live `npm run test:e2e:live` runs (text, table, and
 * image assessment tasks) and are kept intentionally faithful so the mocked
 * suite reflects real provider output. The provider is selected by inspecting
 * the request payload shape/payload length, mirroring how the live router
 * chooses a provider by model id.
 *
 * NOTE: the Mistral text response retains the literal substring
 * "Mistral mocked" so `test/mistral.e2e-spec.ts` can assert the request
 * exercised the Mistral path. The table/image Mistral responses use fully
 * realistic captured text.
 */

// --- Gemini (SDK: `models.generateContent` resolves to `{ text }`) ---

const geminiTextResponse = {
  completeness: {
    score: 3,
    reasoning:
      'The student provided a partial list of fitness tracker data compared to the reference task.',
  },
  accuracy: {
    score: 5,
    reasoning:
      'All data types mentioned (breathing rate, blood oxygen, and body heat/temperature) are valid metrics measured by fitness trackers.',
  },
  spag: {
    score: 2,
    reasoning:
      'There are more than three SPaG errors, including incorrect capitalization of words mid-sentence and missing final punctuation.',
  },
};

const geminiTableResponse = {
  completeness: {
    score: 5,
    reasoning: 'The student completed all six rows required by the task.',
  },
  accuracy: {
    score: 3,
    reasoning:
      'Most entries are accurate, but the ethics topic was incorrectly replaced with electric cars and safety risks were omitted.',
  },
  spag: {
    score: 3,
    reasoning:
      "There are two SPaG errors, including missing hyphens in 'self-driving' and incorrect grammar in 'cars safety'.",
  },
};

const geminiImageResponse = {
  completeness: {
    score: 5,
    reasoning:
      "The student completed both parts of the task by entering a description under 'What actually happened' and pasting a screenshot of their code.",
  },
  accuracy: {
    score: 5,
    reasoning:
      "The student's description accurately reports the output observed from the program, and the code screenshot shows the correct block sequence.",
  },
  spag: {
    score: 4,
    reasoning:
      "There is one minor SPaG error: missing terminal punctuation (full stop) at the end of the sentence 'The LED display showed 'no strangers We're love to''.",
  },
};

// --- Mistral (SDK: `chat.complete` resolves to `{ choices: [{ message: { content } }] }`) ---

const mistralTextResponse = {
  completeness: {
    score: 2,
    reasoning:
      'Mistral mocked response for completeness. Attempted some data types but missed key categories like steps, heart rate, and sleep.',
  },
  accuracy: {
    score: 2,
    reasoning:
      "Some correct data types listed (e.g., blood oxygen) but others are incorrect or incomplete (e.g., 'Heat').",
  },
  spag: {
    score: 3,
    reasoning: "Two minor errors ('Track' should be lowercase, 'Blood' should be 'blood').",
  },
};

const mistralTableResponse = {
  completeness: {
    score: 4,
    reasoning:
      'Student completed all sections but with some deviations in detail compared to the reference task.',
  },
  accuracy: {
    score: 3,
    reasoning:
      'Mostly accurate but missing some expected details (e.g., images for technology, ethical considerations for video summary).',
  },
  spag: {
    score: 5,
    reasoning: 'Flawless spelling, punctuation, and grammar in the added text.',
  },
};

const mistralImageResponse = {
  ReferenceTask:
    "The first image shows the expected output for a Microbit program: 'We're no strangers to love.' It also shows the correct code blocks in the proper order: 'We're', 'no', 'strangers', 'to', 'love'.",
  Template:
    'The second image shows an empty template with instructions to paste a screenshot of code and fill the box. It contains placeholders for "Expected Output" and "What actually happened" but no content is filled in.',
  StudentSubmission:
    "The third image shows the expected output text 'We're no strangers to love.' and the 'What actually happened' text stating 'The LED display showed 'no strangers We're love to''. It also shows code blocks in the order: 'We're', 'no', 'strangers', 'to', 'love'.",
  task_explanation:
    "The student is expected to write code that displays 'We're no strangers to love.' on a Microbit LED screen, document the expected output, and describe what actually happened when the code ran. {The task involves comparing expected vs actual output and providing the code used.}",
  differences:
    'The reference task shows the correct output and correct code order. The template is empty. The student submission correctly identifies the expected output but shows incorrect actual output, despite the code blocks being in the correct order.',
  completeness: {
    score: 5,
    reasoning:
      'The student filled in both the expected output and what actually happened sections, and provided the code screenshot, matching the quantity of the reference task.',
  },
  accuracy: {
    score: 2,
    reasoning:
      "The expected output is correct, and the code blocks shown are in the correct order. However, the 'What actually happened' text shows incorrect output ('no strangers We're love to'), indicating a discrepancy between the code shown and the actual result.",
  },
  spag: {
    score: 5,
    reasoning:
      "The text 'The LED display showed 'no strangers We're love to'' has no spelling, punctuation, or grammar errors.",
  },
};

/**
 * Chooses a response variant based on the request contents.
 * @param {unknown} contents - The Gemini `contents` payload (string or parts array).
 * @returns One of the three captured Gemini response variants.
 */
/**
 * Chooses a response variant based on the Gemini request.
 * @param {unknown} contents - The Gemini `contents` payload (string or parts array).
 * @returns One of the three captured Gemini response variants.
 */
function selectGeminiResponse(contents) {
  const serialized = Array.isArray(contents)
    ? JSON.stringify(contents)
    : typeof contents === 'string'
      ? contents
      : '';
  // Image tasks carry inline base64 `data:` URIs; detect that shape
  // rather than relying on payload length (a text task with a tiny
  // payload would otherwise be indistinguishable from a table by size alone).
  if (/data:image\/[a-z]+;base64/i.test(serialized)) {
    return geminiImageResponse;
  }
  // Text and table tasks are indistinguishable once flattened; both are
  // schema-valid and realistic, so a single variant is fine.
  return geminiTextResponse;
}

/**
 * Chooses a response variant based on the Mistral request.
 * @param {unknown} request - The request object passed to `chat.complete`.
 * @returns One of the three captured Mistral response variants.
 */
function selectMistralResponse(request) {
  const serialized = JSON.stringify(request?.messages ?? []);
  // Image tasks carry inline base64 `data:` URIs; this is the only
  // signal that survives request-shape flattening (text and table
  // tasks are both plain prompt text by the time they reach the mock).
  if (/data:image\/[a-z]+;base64/i.test(serialized)) {
    return mistralImageResponse;
  }
  // Text and table tasks are indistinguishable here; both are schema-valid
  // and realistic. The text variant keeps the `"Mistral mocked"`
  // substring so `test/mistral.e2e-spec.ts` can assert the Mistral
  // path was exercised.
  return mistralTextResponse;
}

// Patch the `models` property on the GoogleGenAI prototype. Because the
// constructor assigns `this.models = new Models(this.apiClient)` as an own
// property, we define both a getter and a silent setter. The setter intercepts
// that constructor assignment, preventing an own property from being created,
// so every subsequent read goes through the getter and returns the mock.
Object.defineProperty(GoogleGenAI.prototype, 'models', {
  configurable: true,
  get() {
    return {
      generateContent: async (request) => ({
        text: JSON.stringify(selectGeminiResponse(request?.contents)),
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
      complete: async (request) => ({
        choices: [
          {
            message: {
              content: JSON.stringify(
                selectMistralResponse(request?.messages ?? []),
              ),
            },
          },
        ],
      }),
    };
  },
});
