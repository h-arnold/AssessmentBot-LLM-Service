import { BadRequestException, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  referenceBase64,
  referenceLabel,
  studentBase64,
  studentLabel,
  templateBase64,
  templateLabel,
} from './image-prompt.test-fixtures.js';
import { ImagePrompt } from './image.prompt.js';
import { buildPromptCacheKey, PromptInput } from './prompt.base.js';
import { readMarkdown } from '../common/file-utilities.js';
import {
  LlmContentPart,
  MultiPartPromptPayload,
} from '../llm/llm.service.interface.js';

// Distinct, genuinely valid standard padded base64 image payloads,
// one per assessment position. The three fixtures deliberately
// exercise every standard base64 padding length (zero, one and two
// '=' characters), and each decodes to different content so label,
// MIME and data pairing is positionally provable.
const referenceDataUri = `data:image/png;base64,${referenceBase64}`;
const templateDataUri = `data:image/jpeg;base64,${templateBase64}`;
const studentDataUri = `data:image/webp;base64,${studentBase64}`;

const validInputs: PromptInput = {
  referenceTask: referenceDataUri,
  studentTask: studentDataUri,
  emptyTask: templateDataUri,
};

// The exact label strings required by SPEC.md, in payload order.
const testSystemPrompt = 'System instruction.';

const referenceImagePart: LlmContentPart = {
  kind: 'image',
  mimeType: 'image/png',
  data: referenceBase64,
};
const templateImagePart: LlmContentPart = {
  kind: 'image',
  mimeType: 'image/jpeg',
  data: templateBase64,
};
const studentImagePart: LlmContentPart = {
  kind: 'image',
  mimeType: 'image/webp',
  data: studentBase64,
};

// Interleaves the three ordered label/image pairs, with each label
// immediately preceding its corresponding image.
const buildUserParts = (
  referenceImage: LlmContentPart,
  templateImage: LlmContentPart,
  studentImage: LlmContentPart,
): LlmContentPart[] => {
  return [
    { kind: 'text', text: referenceLabel },
    referenceImage,
    { kind: 'text', text: templateLabel },
    templateImage,
    { kind: 'text', text: studentLabel },
    studentImage,
  ];
};

// The exact six ordered user parts required by SPEC.md.
const expectedUserParts = buildUserParts(
  referenceImagePart,
  templateImagePart,
  studentImagePart,
);

describe('ImagePrompt', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  const buildPrompt = (
    inputs: PromptInput = validInputs,
    systemPrompt?: string,
  ): ImagePrompt => new ImagePrompt(inputs, logger, systemPrompt);

  describe('multipart payload assembly', () => {
    it('builds exactly one system and one user message with the six ordered label/image parts', async () => {
      const payload = (await buildPrompt(
        validInputs,
        testSystemPrompt,
      ).buildMessage()) as MultiPartPromptPayload;

      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0]).toStrictEqual({
        role: 'system',
        parts: [{ kind: 'text', text: testSystemPrompt }],
      });
      expect(payload.messages[1]).toStrictEqual({
        role: 'user',
        parts: expectedUserParts,
      });
    });

    it('contains no assistant turns and no legacy payload fields', async () => {
      const payload = (await buildPrompt(
        validInputs,
        testSystemPrompt,
      ).buildMessage()) as MultiPartPromptPayload;

      expect(payload.messages.map((message) => message.role)).toStrictEqual([
        'system',
        'user',
      ]);
      expect('system' in payload).toBe(false);
      expect('user' in payload).toBe(false);
      expect('images' in payload).toBe(false);
    });

    it('omits the system message when no system prompt is supplied', async () => {
      const prompt = new ImagePrompt(validInputs, logger);
      const payload = (await prompt.buildMessage()) as MultiPartPromptPayload;

      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0]).toStrictEqual({
        role: 'user',
        parts: expectedUserParts,
      });
    });
  });

  describe('data URI and base64 validation', () => {
    it('rejects a malformed data URI with the existing BadRequestException message', async () => {
      const inputs: PromptInput = {
        ...validInputs,
        studentTask: 'not-a-data-uri',
      };

      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        BadRequestException,
      );
      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        'Invalid Data URI provided for an image field.',
      );
    });

    it('does not log malformed data URI content before rejecting it', async () => {
      const inputs: PromptInput = {
        ...validInputs,
        studentTask: 'student-private-content-not-a-data-uri',
      };
      const errorLog = vi.spyOn(logger, 'error');

      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        BadRequestException,
      );
      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        'Invalid Data URI provided for an image field.',
      );

      expect(errorLog).not.toHaveBeenCalled();
    });

    it('rejects an empty base64 payload with a raw ZodError', async () => {
      const inputs: PromptInput = {
        ...validInputs,
        referenceTask: 'data:image/png;base64,',
      };

      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        ZodError,
      );
    });

    it('rejects malformed base64 with a raw ZodError', async () => {
      const inputs: PromptInput = {
        ...validInputs,
        emptyTask: 'data:image/jpeg;base64,not-valid-base64!',
      };

      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        ZodError,
      );
    });

    it('rejects whitespace-containing base64 with a raw ZodError', async () => {
      const inputs: PromptInput = {
        ...validInputs,
        studentTask: 'data:image/webp;base64,SG Vs bG8=',
      };

      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        ZodError,
      );
    });

    it('rejects unpadded base64 with a raw ZodError', async () => {
      const inputs: PromptInput = {
        ...validInputs,
        referenceTask: 'data:image/png;base64,YQ',
      };

      await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
        ZodError,
      );
    });
  });

  describe('per-image size boundary', () => {
    // The schema caps each image at exactly 1 MiB (1,048,576 decoded
    // bytes). 'A' decodes to a zero byte, so these strings are the
    // standard padded base64 encodings of exactly 1 MiB and of
    // 1 MiB plus one byte respectively.
    const oneMibBase64 = 'A'.repeat(1398102) + '==';
    const oneMibPlusOneBase64 = 'A'.repeat(1398103) + '=';
    const oneMibDataUri = `data:image/png;base64,${oneMibBase64}`;
    const oneMibPlusOneDataUri = `data:image/png;base64,${oneMibPlusOneBase64}`;

    describe.each([
      {
        position: 'reference',
        field: 'referenceTask',
        makeExpectedParts: (part: LlmContentPart): LlmContentPart[] =>
          buildUserParts(part, templateImagePart, studentImagePart),
      },
      {
        position: 'template',
        field: 'emptyTask',
        makeExpectedParts: (part: LlmContentPart): LlmContentPart[] =>
          buildUserParts(referenceImagePart, part, studentImagePart),
      },
      {
        position: 'student',
        field: 'studentTask',
        makeExpectedParts: (part: LlmContentPart): LlmContentPart[] =>
          buildUserParts(referenceImagePart, templateImagePart, part),
      },
    ])('$position image position', ({ field, makeExpectedParts }) => {
      it('accepts an image of exactly 1 MiB', async () => {
        const inputs: PromptInput = {
          ...validInputs,
          [field]: oneMibDataUri,
        };
        const payload = (await buildPrompt(
          inputs,
          testSystemPrompt,
        ).buildMessage()) as MultiPartPromptPayload;

        expect(payload.messages[1].parts).toStrictEqual(
          makeExpectedParts({
            kind: 'image',
            mimeType: 'image/png',
            data: oneMibBase64,
          }),
        );
      });

      it('rejects an image of 1 MiB plus one byte with a raw ZodError', async () => {
        const inputs: PromptInput = {
          ...validInputs,
          [field]: oneMibPlusOneDataUri,
        };

        await expect(buildPrompt(inputs).buildMessage()).rejects.toThrow(
          ZodError,
        );
      });
    });

    it('does not apply an aggregate cap across three individually valid 1 MiB images', async () => {
      const inputs: PromptInput = {
        referenceTask: `data:image/png;base64,${oneMibBase64}`,
        emptyTask: `data:image/jpeg;base64,${oneMibBase64}`,
        studentTask: `data:image/webp;base64,${oneMibBase64}`,
      };
      const payload = (await buildPrompt(
        inputs,
        testSystemPrompt,
      ).buildMessage()) as MultiPartPromptPayload;

      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[1].parts).toHaveLength(6);
      expect(
        payload.messages[1].parts.filter((part) => part.kind === 'image'),
      ).toHaveLength(3);
    });
  });

  describe('promptCacheKey derivation', () => {
    it('hashes the original reference data URI on the multipart payload', async () => {
      const payload = (await buildPrompt(
        validInputs,
        testSystemPrompt,
      ).buildMessage()) as MultiPartPromptPayload;

      expect(payload.messages).toHaveLength(2);
      expect(payload.promptCacheKey).toBe(
        buildPromptCacheKey(referenceDataUri),
      );
    });
  });

  describe('system template contract', () => {
    let template: string;

    beforeAll(async () => {
      template = await readMarkdown('image.system.prompt.md');
    });

    it('identifies three labelled images unambiguously', () => {
      expect(template).toContain('# The Images');
      expect(template).not.toContain('2 - 3');
      expect(template).toContain('three images');
      expect(template).toContain('**The first image**');
      expect(template).toContain('**The second image**');
      expect(template).toContain('**The third image**');
    });

    it('preserves the output description headings and step structure', () => {
      const headings = [
        '# Your Role',
        '# The Images',
        '# Task',
        '## Step 1:',
        '## Step 2:',
        '## Step 3:',
        '## Step 4:',
        '### 1. **Completeness** (0-5):',
        '### 2. **Accuracy** (0-5):',
        '### 3. **Spelling, Punctuation, and Grammar (SPaG)** (0-5):',
        '#### Example SPaG Score: 2',
        '#### Example SPaG Score: 4',
        '## You must use exactly the following JSON structure for the scores:',
      ];
      for (const heading of headings) {
        expect(template).toContain(heading);
      }
    });

    it('preserves the scoring rubric', () => {
      const rubricLines = [
        'Score 0 if the submission is identical to the empty template, meaning no work has been done.',
        'Score 5 if the submission has the same _quantity_ of work as the reference task.',
        'A submission that is identical to the reference task must receive a score of 5.',
        'Score 0 if the submission is identical to the empty template.',
        'Score 5 if it perfectly matches the reference task in accuracy and detail.',
        'Score 0 if it matches the empty task.',
        'Score 5 for flawless SPaG.',
        'Judge only whether the student _attempted_ each part of the task.',
      ];
      for (const rubricLine of rubricLines) {
        expect(template).toContain(rubricLine);
      }
    });

    it('preserves every example heading and its three-part structure', () => {
      const exampleHeadings = [
        '### Example 1: Partially correct student task',
        '### Example 2: Student task as good or better than the reference task',
        '### Example 3: No attempt made by the student',
        "### Example 4: Where you don't receive all the images you need or the quality is too low for you to determine whether the student has completed the task.",
      ];
      for (const exampleHeading of exampleHeadings) {
        expect(template).toContain(exampleHeading);
      }
      expect(
        template.match(/Part 1 - Image descriptions:/g) ?? [],
      ).toHaveLength(4);
      expect(
        template.match(/Part 2 - Goal of the exercise:/g) ?? [],
      ).toHaveLength(4);
      expect(template.match(/Part 3 - Scores in JSON:/g) ?? []).toHaveLength(4);
    });

    it('preserves the worked example content', () => {
      const exampleContent = [
        'a completed poster about self driving cars with two titled lists of arguments.',
        'the same poster layout with empty boxes and no student writing.',
        'The student is asked to list at least three valid and fully explained reasons for and against self driving cars, using appropriate technical vocabulary. The completed poster is the model answer.',
        'Ways self driving cars could be safer:',
        'People dont have road rage',
        'They wont get distracted by nearby obstacles.',
        '"completeness" : {',
        '"reasoning": "{reasoning}"',
      ];
      for (const content of exampleContent) {
        expect(template).toContain(content);
      }
    });

    it('closes with the image placement marker', () => {
      expect(template.trimEnd()).toContain('Images are below:');
    });
  });
});
