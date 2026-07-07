import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { z } from 'zod';

import { HttpExceptionFilter } from './http-exception.filter.js';
import { JsonParserUtility } from './json-parser.utility.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('CommonModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        HttpExceptionFilter,
        {
          provide: ZodValidationPipe,
          useValue: new ZodValidationPipe(z.any()),
        }, // Provide a mock instance with a valid Zod schema
        JsonParserUtility,
        Logger,
      ],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should export shared providers', () => {
    const filter = module.get<HttpExceptionFilter>(HttpExceptionFilter);
    const pipe = module.get<ZodValidationPipe>(ZodValidationPipe);
    const utility: JsonParserUtility =
      module.get<JsonParserUtility>(JsonParserUtility);

    expect(filter).toBeDefined();
    expect(pipe).toBeDefined();
    expect(utility).toBeDefined();
  });
});
