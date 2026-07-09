import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { StatusController } from './status.controller.js';
import { StatusService, HealthCheckResponse } from './status.service.js';

describe('StatusController', () => {
  let controller: StatusController;
  let service: StatusService;

  beforeEach(async () => {
    const now = new Date();
    const timestamp = now.toISOString();
    const mockHealth: HealthCheckResponse = {
      status: 'ok',
      version: '0.2.0',
      timestamp,
      systemInfo: {
        platform: 'linux',
        arch: 'x64',
        release: '1.0.0',
        uptime: 123,
        hostname: 'host',
        totalMemory: 1,
        freeMemory: 1,
        cpus: 1,
      },
    };
    const mockStatusService = {
      getHello: vi.fn().mockReturnValue('Hello World!'),
      getHealth: vi.fn().mockReturnValue(mockHealth),
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
      const result: HealthCheckResponse = {
        status: 'ok',
        version: '0.2.0',
        timestamp: expect.any(String) as unknown as string,
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          release: '1.0.0',
          uptime: 123,
          hostname: 'host',
          totalMemory: 1,
          freeMemory: 1,
          cpus: 1,
        },
      };
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
