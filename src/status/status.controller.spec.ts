import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { StatusController } from './status.controller.js';
import { StatusService, HealthCheckResponse } from './status.service.js';

describe('StatusController', () => {
  let controller: StatusController;
  let service: StatusService;

  beforeEach(async () => {
    const mockStatusService = {
      getHello: vi.fn().mockReturnValue('Hello World!'),
      getHealth: vi.fn().mockReturnValue({ status: 'ok', uptime: 123 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusController],
      providers: [
        {
          provide: StatusService,
          useValue: mockStatusService,
        },
      ],
    }).compile();

    controller = module.get<StatusController>(StatusController);
    service = module.get<StatusService>(StatusService);
  });

  describe('getHello', () => {
    it('should return a hello message', () => {
      expect(controller.getHello()).toBe('Hello World!');
      expect(service.getHello).toHaveBeenCalled();
    });
  });

  describe('getHealth', () => {
    it('should return health check response', () => {
      const result: HealthCheckResponse = { status: 'ok', uptime: 123 };
      expect(controller.getHealth()).toEqual(result);
      expect(service.getHealth).toHaveBeenCalled();
    });
  });

  describe('testError', () => {
    it('should throw an HttpException with the correct message', () => {
      expect(() => controller.testError()).toThrow('This is a test error');
    });

    it('should throw an HttpException', () => {
      expect(() => controller.testError()).toThrow(HttpException);
    });
  });
});
