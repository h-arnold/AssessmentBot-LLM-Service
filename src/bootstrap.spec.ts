import { jest, describe, it, expect, afterEach } from '@jest/globals';

const nestFactoryCreate: jest.Mock = jest.fn();
const jsonMiddleware: jest.Mock = jest.fn();
const json: jest.Mock = jest.fn(() => jsonMiddleware);

class Logger {}
class LoggerErrorInterceptor {}
class AppModule {}
class ConfigService {}

jest.mock('@nestjs/core', () => ({
  NestFactory: { create: nestFactoryCreate },
}));
jest.mock('express', () => ({ json }));
jest.mock('nestjs-pino', () => ({
  Logger,
  LoggerErrorInterceptor,
}));
jest.mock('./app.module', () => ({
  AppModule,
}));
jest.mock('./config/config.service', () => ({
  ConfigService,
}));

describe('bootstrap', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.resetModules();
    jest.clearAllMocks();
  });

  type LoadBootstrapResult = {
    app: {
      useLogger: jest.Mock;
      useGlobalInterceptors: jest.Mock;
      getHttpAdapter: jest.Mock;
      get: jest.Mock;
      use: jest.Mock;
      listen: jest.Mock;
    };
    configService: {
      getGlobalPayloadLimit: jest.Mock;
      get: jest.Mock;
    };
    expressInstance: {
      set: jest.Mock;
    };
    loggerInstance: {
      log: jest.Mock;
    };
  };

  const loadBootstrap = async (options?: {
    bufferLogs?: boolean;
  }): Promise<LoadBootstrapResult> => {
    process.env = { ...originalEnvironment };

    const loggerInstance = { log: jest.fn() };
    const expressInstance = { set: jest.fn() };
    const configService = {
      getGlobalPayloadLimit: jest.fn(() => '1mb'),
      get: jest.fn((key: string) => {
        if (key === 'PORT') {
          return '3030';
        }
        return;
      }),
    };

    const httpAdapter = {
      getInstance: (): { set: jest.Mock } => expressInstance,
    };

    const tokenLookup = new Map<unknown, unknown>([
      [Logger, loggerInstance],
      [ConfigService, configService],
    ]);

    const app = {
      useLogger: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      getHttpAdapter: jest.fn(() => httpAdapter),
      get: jest.fn((token: unknown) => tokenLookup.get(token)),
      use: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    nestFactoryCreate.mockResolvedValue(app);

    const { bootstrap } = await import('./bootstrap');
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
