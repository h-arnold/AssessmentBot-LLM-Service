import { Test, TestingModule } from '@nestjs/testing';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

import { AssessorService } from './assessor.service.js';
import { CreateAssessorDto, TaskType } from './dto/create-assessor.dto.js';
import { readMarkdown } from '../../common/file-utilities.js';
import {
  ILlmService,
  LLM_SERVICE_TOKEN,
  LlmPayload,
} from '../../llm/llm.service.interface.js';
import { LlmResponse } from '../../llm/types.js';
import {
  buildMultiPartPromptPayload,
  buildPromptCacheKey,
} from '../../prompt/prompt.base.js';
import { PromptModule } from '../../prompt/prompt.module.js';

// Distinct, genuinely valid standard padded base64 payloads, one per
// assessment position, so MIME/data pairing is provable.
const referenceBase64 = 'cmVmZXJlbmNlLWltYWdlLWJ5dGVz';
const templateBase64 = 'dGVtcGxhdGUtaW1hZ2UtYnl0ZXM=';
const studentBase64 = 'c3R1ZGVudC1pbWFnZS1ieXRlcw==';

const referenceDataUri = `data:image/png;base64,${referenceBase64}`;
const templateDataUri = `data:image/jpeg;base64,${templateBase64}`;
const studentDataUri = `data:image/webp;base64,${studentBase64}`;

// The exact label strings the ImagePrompt hook interleaves with the
// images, in payload order.
const referenceLabel = 'Reference Task — benchmark for a perfect score.';
const templateLabel = 'Template — the unfilled task.';
const studentLabel = 'Student Submission — assess this image.';

// A valid IMAGE assessment DTO built from the three fixture data URIs.
const validDto = (): CreateAssessorDto => {
  return {
    taskType: TaskType.IMAGE,
    reference: referenceDataUri,
    template: templateDataUri,
    studentResponse: studentDataUri,
  };
};

const createMockLlmResponse = (): LlmResponse => {
  return {
    completeness: {
      score: 5,
      reasoning: 'Integration completeness reasoning.',
    },
    accuracy: {
      score: 4,
      reasoning: 'Integration accuracy reasoning.',
    },
    spag: {
      score: 3,
      reasoning: 'Integration SPAG reasoning.',
    },
  };
};

describe('AssessorService IMAGE multi-part integration', () => {
  let service: AssessorService;
  let llmService: ILlmService;
  let mockLlmService: {
    send: Mock<(payload: LlmPayload) => Promise<LlmResponse>>;
  };
  let systemTemplate: string;

  beforeAll(async () => {
    // Controlled configuration for the real ConfigService, which
    // validates these values against the environment schema when the
    // testing module compiles. The schema defaults route both task
    // types to the Mistral prefix, so both provider keys are required.
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.API_KEYS = 'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
    process.env.APP_NAME = 'Assessment Bot LLM Service';
    process.env.APP_VERSION = 'test-version';
    process.env.LOG_LEVEL = 'debug';

    systemTemplate = await readMarkdown('image.system.prompt.md');
  });

  beforeEach(async () => {
    mockLlmService = {
      send: vi.fn<(payload: LlmPayload) => Promise<LlmResponse>>(),
    };
    // The real PromptFactory (from PromptModule) constructs the
    // ImagePrompt through the real multi-part base; only the LLM
    // boundary is mocked.
    const module: TestingModule = await Test.createTestingModule({
      imports: [PromptModule],
      providers: [
        AssessorService,
        { provide: LLM_SERVICE_TOKEN, useValue: mockLlmService },
      ],
    }).compile();

    service = module.get<AssessorService>(AssessorService);
    llmService = module.get<ILlmService>(LLM_SERVICE_TOKEN);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('real construction flow', () => {
    it('sends the factory-built multi-part payload unchanged and returns the LLM response', async () => {
      // The expected payload is assembled through the same builder the
      // production chain uses, so deep equality proves the payload —
      // including the reference-derived cache key and the six ordered
      // user parts — reaches the LLM boundary unchanged.
      const expectedPayload = buildMultiPartPromptPayload({
        messages: [
          {
            role: 'system',
            parts: [{ kind: 'text', text: systemTemplate }],
          },
          {
            role: 'user',
            parts: [
              { kind: 'text', text: referenceLabel },
              {
                kind: 'image',
                mimeType: 'image/png',
                data: referenceBase64,
              },
              { kind: 'text', text: templateLabel },
              {
                kind: 'image',
                mimeType: 'image/jpeg',
                data: templateBase64,
              },
              { kind: 'text', text: studentLabel },
              {
                kind: 'image',
                mimeType: 'image/webp',
                data: studentBase64,
              },
            ],
          },
        ],
        promptCacheKey: buildPromptCacheKey(referenceDataUri),
      });
      const mockResponse = createMockLlmResponse();
      mockLlmService.send.mockResolvedValue(mockResponse);

      const result = await service.createAssessment(validDto());

      expect(llmService.send).toHaveBeenCalledExactlyOnceWith(expectedPayload);
      // Identity (not deep equality) proves the returned response is
      // the LLM response, unchanged.
      expect(result).toBe(mockResponse);
    });

    it('summarises the built payload as a two-message conversation', async () => {
      mockLlmService.send.mockResolvedValue(createMockLlmResponse());
      const loggerSpy = vi.spyOn(
        (
          service as unknown as {
            logger: { debug: (...arguments_: unknown[]) => void };
          }
        ).logger,
        'debug',
      );

      await service.createAssessment(validDto());

      expect(loggerSpy).toHaveBeenCalledWith(
        'LLM payload built for task type: IMAGE (conversation prompt with 2 messages).',
      );
    });
  });

  describe('construction failure prevents send', () => {
    it('fails with a raw ZodError and never sends when base64 is malformed', async () => {
      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: referenceDataUri,
        template: 'data:image/jpeg;base64,not-valid-base64!',
        studentResponse: studentDataUri,
      };

      await expect(service.createAssessment(dto)).rejects.toThrow(ZodError);
      expect(llmService.send).not.toHaveBeenCalled();
    });

    it('fails with a raw ZodError and never sends when an image exceeds the 1 MiB limit', async () => {
      // 'A' decodes to a zero byte, so this is the standard padded
      // base64 encoding of exactly 1 MiB plus one byte.
      const oneMibPlusOneBase64 = 'A'.repeat(1398103) + '=';
      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: referenceDataUri,
        template: `data:image/jpeg;base64,${oneMibPlusOneBase64}`,
        studentResponse: studentDataUri,
      };

      await expect(service.createAssessment(dto)).rejects.toThrow(ZodError);
      expect(llmService.send).not.toHaveBeenCalled();
    });
  });
});
