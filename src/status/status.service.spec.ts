import * as packageJson from '../../package.json' with { type: 'json' };

const osMock = {
  platform: vi.fn(),
  arch: vi.fn(),
  release: vi.fn(),
  uptime: vi.fn(),
  hostname: vi.fn(),
  totalmem: vi.fn(),
  freemem: vi.fn(),
  cpus: vi.fn(),
};

vi.mock('node:os', () => osMock);

describe('StatusService', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = { ...originalEnvironment };
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns the expected greeting', async () => {
    const { StatusService } = await import('./status.service.js');
    const service = new StatusService();

    expect(service.getHello()).toBe('Hello World!');
  });

  it('returns system metrics and version details', async () => {
    osMock.platform.mockReturnValue('linux');
    osMock.arch.mockReturnValue('x64');
    osMock.release.mockReturnValue('1.0.0');
    osMock.uptime.mockReturnValue(1234);
    osMock.hostname.mockReturnValue('test-host');
    osMock.totalmem.mockReturnValue(1024);
    osMock.freemem.mockReturnValue(512);
    osMock.cpus.mockReturnValue([{}, {}]);

    const fixedDate = new Date('2024-01-01T00:00:00.000Z');
    vi.useFakeTimers().setSystemTime(fixedDate);

    const { StatusService } = await import('./status.service.js');
    const service = new StatusService();

    const result = service.getHealth();

    expect(result).toEqual({
      status: 'ok',
      version: packageJson.default.version,
      timestamp: fixedDate.toISOString(),
      systemInfo: {
        platform: 'linux',
        arch: 'x64',
        release: '1.0.0',
        uptime: 1234,
        hostname: 'test-host',
        totalMemory: 1024,
        freeMemory: 512,
        cpus: 2,
      },
    });

    expect(osMock.platform).toHaveBeenCalled();
    expect(osMock.cpus).toHaveBeenCalled();
  });
});
