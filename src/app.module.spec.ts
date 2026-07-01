import { IncomingMessage, ServerResponse } from 'node:http';

import { Params } from 'nestjs-pino';

import { ConfigService } from './config/config.service';

type LoggerModuleAsyncOptions = {
  useFactory: (configService: ConfigService) => Params;
};

let loggerModuleOptions: LoggerModuleAsyncOptions | undefined;

const forRootAsync = jest.fn((options: LoggerModuleAsyncOptions) => {
  loggerModuleOptions = options;
});

jest.mock('nestjs-pino', () => ({
  LoggerModule: { forRootAsync },
}));

describe('AppModule logging configuration', () => {
  const originalEnvironment = process.env;

  const getLoggerModuleOptions = (): LoggerModuleAsyncOptions => {
    if (loggerModuleOptions === undefined) {
      throw new Error('LoggerModule.forRootAsync was not called');
    }

    return loggerModuleOptions;
  };

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.resetModules();
    jest.clearAllMocks();
  });

  const loadModule = async (): Promise<{ AppModule: unknown }> => {
    jest.resetModules();
    forRootAsync.mockClear();
    loggerModuleOptions = undefined;
    return import('./app.module');
  };

  const buildConfigService = (
    overrides: Partial<Record<string, string>>,
  ): { get: jest.Mock } => ({
    get: jest.fn((key: string) => {
      const defaults = new Map<string, string>([
        ['LOG_LEVEL', 'debug'],
        ['NODE_ENV', 'development'],
        ...Object.entries(overrides).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ]);

      return defaults.get(key);
    }),
  });

  it('uses the file transport when LOG_FILE is set', async () => {
    process.env = { ...originalEnvironment, LOG_FILE: '/tmp/app.log' };

    const module = await loadModule();
    expect(module.AppModule).toBeDefined();
    expect(forRootAsync).toHaveBeenCalledTimes(1);

    const options = getLoggerModuleOptions();
    const configService = buildConfigService({ NODE_ENV: 'production' });
    const result: Params = options.useFactory(
      configService as unknown as ConfigService,
    );

    expect(result.pinoHttp.transport).toEqual({
      target: 'pino/file',
      options: { destination: '/tmp/app.log' },
    });

    const requestWithId = { id: 'abc-123' } as IncomingMessage;
    const requestWithoutId = {} as IncomingMessage;
    const customProperties = result.pinoHttp.customProps as (
      request: IncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => { reqId: string | number | undefined };

    expect(
      customProperties(requestWithId, {} as ServerResponse<IncomingMessage>),
    ).toEqual({
      reqId: 'abc-123',
    });
    expect(
      customProperties(requestWithoutId, {} as ServerResponse<IncomingMessage>),
    ).toEqual({
      reqId: undefined,
    });
  });

  it('uses JSON logging without transport in production', async () => {
    process.env = { ...originalEnvironment };

    await loadModule();
    const options = getLoggerModuleOptions();
    const configService = buildConfigService({ NODE_ENV: 'production' });
    const result: Params = options.useFactory(
      configService as unknown as ConfigService,
    );

    expect(result.pinoHttp.level).toBe('debug');
    expect(result.pinoHttp.transport).toBeUndefined();
  });

  it('uses pino-pretty transport in development', async () => {
    process.env = { ...originalEnvironment };

    await loadModule();
    const options = getLoggerModuleOptions();
    const configService = buildConfigService({ NODE_ENV: 'development' });
    const result: Params = options.useFactory(
      configService as unknown as ConfigService,
    );

    expect(result.pinoHttp.transport).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true },
    });
  });
});
