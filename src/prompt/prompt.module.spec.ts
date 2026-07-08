import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PromptFactory } from './prompt.factory.js';
import { PromptModule } from './prompt.module.js';

describe('PromptModule', () => {
  it('should compile the module', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PromptModule],
      providers: [Logger],
    }).compile();

    expect(module).toBeDefined();
  });

  it('should provide the PromptFactory', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PromptModule],
      providers: [Logger],
    }).compile();

    const promptFactory = module.get<PromptFactory>(PromptFactory);
    expect(promptFactory).toBeDefined();
  });
});
