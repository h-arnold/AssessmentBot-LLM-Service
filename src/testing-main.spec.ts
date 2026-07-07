import { Mock } from 'vitest';

const { dotenvConfig, bootstrap } = vi.hoisted(() => ({
  dotenvConfig: vi.fn() as Mock,
  bootstrap: vi.fn() as Mock,
}));

vi.mock('dotenv', () => ({ config: dotenvConfig }));
vi.mock('./bootstrap.js', () => ({ bootstrap }));

describe('testing entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads .test.env and delegates to bootstrap with test options', async () => {
    const { startTest } = await import('./testing-main.js');

    await startTest();

    expect(dotenvConfig).toHaveBeenCalledWith({ path: '.test.env' });
    expect(bootstrap).toHaveBeenCalledWith({
      bufferLogs: false,
      host: '127.0.0.1',
    });
  });
});
