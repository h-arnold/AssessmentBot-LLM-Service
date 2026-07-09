import { Mock } from 'vitest';

import type { BootstrapOptions } from './bootstrap.js';

const nestFactoryCreate: Mock = vi.fn();
const jsonMiddleware: Mock = vi.fn();
const json: Mock = vi.fn(() => jsonMiddleware);

class Logger {}
class LoggerErrorInterceptor {}
class AppModule {}
class ConfigService {}

vi.mock('@nestjs/core', () => ({
  NestFactory: { create: nestFactoryCreate },
}));
vi.mock('express', () => ({ json }));
vi.mock('nestjs-pino', () => ({
  Logger,
  LoggerErrorInterceptor,
}));
vi.mock('./app.module', () => ({
  AppModule,
}));
vi.mock('./config/config.service', () => ({
  ConfigService,
}));

describe('bootstrap', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.resetModules();
    vi.clearAllMocks();
  });

  type LoadBootstrapResult = {
    app: {
      useLogger: Mock;
      useGlobalInterceptors: Mock;
      getHttpAdapter: Mock;
      get: Mock;
      use: Mock;
      listen: Mock;
    };
    configService: {
      getGlobalPayloadLimit: Mock;
      get: Mock;
    };
    expressInstance: {
      set: Mock;
    };
    loggerInstance: {
      log: Mock;
    };
  };

  const loadBootstrap = async (
    options?: BootstrapOptions,
  ): Promise<LoadBootstrapResult> => {
    process.env = { ...originalEnvironment };

    const loggerInstance = { log: vi.fn() };
    const expressInstance = { set: vi.fn() };
    const configService = {
      getGlobalPayloadLimit: vi.fn(() => '1mb'),
      get: vi.fn((key: string) => (key === 'PORT' ? '3030' : undefined)),
    };

    const httpAdapter = {
      getInstance: (): { set: Mock } => expressInstance,
    };

    const tokenLookup = new Map<unknown, unknown>([
      [Logger, loggerInstance],
      [ConfigService, configService],
    ]);

    const app = {
      useLogger: vi.fn(),
      useGlobalInterceptors: vi.fn(),
      getHttpAdapter: vi.fn(() => httpAdapter),
      get: vi.fn((token: unknown) => tokenLookup.get(token)),
      use: vi.fn(),
      listen: vi.fn().mockResolvedValue(undefined),
    };

    nestFactoryCreate.mockResolvedValue(app);

    const { bootstrap } = await import('./bootstrap.js');
    await bootstrap(options);

    return {
      app,
      configService,
      expressInstance,
      loggerInstance,
    };
  };

  it('bootstraps with default settings', async () => {
    const { app, configService, expressInstance, loggerInstance } =
      await loadBootstrap();

    expect(nestFactoryCreate).toHaveBeenCalledWith(expect.any(Function), {
      bufferLogs: true,
    });
    expect(app.useLogger).toHaveBeenCalledWith(loggerInstance);
    expect(app.useGlobalInterceptors).toHaveBeenCalledWith(
      expect.any(LoggerErrorInterceptor),
    );
    expect(expressInstance.set).toHaveBeenCalledWith(
      'query parser',
      'extended',
    );
    expect(configService.getGlobalPayloadLimit).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ limit: '1mb' });
    expect(app.use).toHaveBeenCalledWith(jsonMiddleware);
    expect(app.listen).toHaveBeenCalledWith('3030', '0.0.0.0');
  });

  it('allows bufferLogs to be overridden', async () => {
    await loadBootstrap({ bufferLogs: false });

    expect(nestFactoryCreate).toHaveBeenCalledWith(expect.any(Function), {
      bufferLogs: false,
    });
  });

  it('allows the host to be overridden', async () => {
    const { app } = await loadBootstrap({ host: '127.0.0.1' });

    expect(app.listen).toHaveBeenCalledWith('3030', '127.0.0.1');
  });
});
