import { IncomingMessage, ServerResponse } from 'node:http';

import { Params } from 'nestjs-pino';

import { ConfigService } from './config/config.service';

type LoggerModuleAsyncOptions = {
  useFactory: (configService: ConfigService) => Params;
};

const forRootAsync = jest.fn() as jest.Mock & {
  lastOptions?: LoggerModuleAsyncOptions;
};

forRootAsync.mockImplementation((options: LoggerModuleAsyncOptions) => {
  forRootAsync.lastOptions = options;
});

jest.mock('nestjs-pino', () => ({
  LoggerModule: { forRootAsync },
}));

const getLoggerModuleOptions = (): LoggerModuleAsyncOptions => {
  if (forRootAsync.lastOptions === undefined) {
    throw new Error('LoggerModule.forRootAsync was not called');
  }

  return forRootAsync.lastOptions;
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

const loadModule = async (): Promise<{ AppModule: unknown }> => {
  jest.resetModules();
  forRootAsync.mockClear();
  forRootAsync.lastOptions = undefined;
  return import('./app.module');
};

describe('AppModule logging configuration', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('uses the file transport when LOG_FILE is set', async () => {
    process.env = { ...originalEnvironment, LOG_FILE: 'test-app-log.log' };

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
      options: { destination: 'test-app-log.log' },
    });

    const requestWithId = { id: 'abc-123' } as IncomingMessage;
    const requestWithoutId = {} as IncomingMessage;
    const customProperties = result.pinoHttp.customProps as (
      request: IncomingMessage,
      response: ServerResponse<IncomingMessage>,
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
