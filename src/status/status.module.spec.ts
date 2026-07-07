import { Test, TestingModule } from '@nestjs/testing';

import { StatusModule } from './status.module.js';
import { StatusService } from './status.service.js';

describe('StatusModule', () => {
  it('provides the status service', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [StatusModule],
    }).compile();

    const service = module.get(StatusService);
    expect(service).toBeInstanceOf(StatusService);
  });
});
