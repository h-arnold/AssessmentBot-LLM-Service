import { Mock } from 'vitest';

const { dotenvConfig, bootstrap } = vi.hoisted(() => ({
  dotenvConfig: vi.fn() as Mock,
  bootstrap: vi.fn() as Mock,
}));

vi.mock('dotenv', () => ({ config: dotenvConfig }));
vi.mock('./bootstrap.js', () => ({ bootstrap }));

describe('main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads .env and delegates to bootstrap', async () => {
    const { start } = await import('./main.js');

    await start();

    expect(dotenvConfig).toHaveBeenCalledWith({ path: '.env' });
    expect(bootstrap).toHaveBeenCalledWith();
  });
});
