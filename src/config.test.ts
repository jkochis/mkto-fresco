describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should load all required environment variables', () => {
    process.env.MARKETO_CLIENT_ID = 'test-client-id';
    process.env.MARKETO_CLIENT_SECRET = 'test-client-secret';
    process.env.MARKETO_ENDPOINT = 'https://test.mktorest.com';
    process.env.ALFRESCO_URL = 'https://alfresco.test.com';
    process.env.ALFRESCO_USERNAME = 'testuser';
    process.env.ALFRESCO_PASSWORD = 'testpass';
    process.env.ALFRESCO_BASE_PATH = '/Test Path';

    const { loadConfig } = require('./config');
    const config = loadConfig();

    expect(config.marketo.clientId).toBe('test-client-id');
    expect(config.marketo.clientSecret).toBe('test-client-secret');
    expect(config.marketo.endpoint).toBe('https://test.mktorest.com');
    expect(config.alfresco.url).toBe('https://alfresco.test.com');
    expect(config.alfresco.username).toBe('testuser');
    expect(config.alfresco.password).toBe('testpass');
    expect(config.alfresco.basePath).toBe('/Test Path');
  });

  it('should use default values for optional variables', () => {
    process.env.MARKETO_CLIENT_ID = 'test-client-id';
    process.env.MARKETO_CLIENT_SECRET = 'test-client-secret';
    process.env.MARKETO_ENDPOINT = 'https://test.mktorest.com';
    process.env.ALFRESCO_URL = 'https://alfresco.test.com';
    process.env.ALFRESCO_USERNAME = 'testuser';
    process.env.ALFRESCO_PASSWORD = 'testpass';

    const { loadConfig } = require('./config');
    const config = loadConfig();

    expect(config.alfresco.basePath).toBe('/Company Home/Marketo Emails');
    expect(config.sync.lookbackDays).toBe(90);
    expect(config.sync.batchSize).toBe(50);
  });

  it('should parse numeric environment variables', () => {
    process.env.MARKETO_CLIENT_ID = 'test-client-id';
    process.env.MARKETO_CLIENT_SECRET = 'test-client-secret';
    process.env.MARKETO_ENDPOINT = 'https://test.mktorest.com';
    process.env.ALFRESCO_URL = 'https://alfresco.test.com';
    process.env.ALFRESCO_USERNAME = 'testuser';
    process.env.ALFRESCO_PASSWORD = 'testpass';
    process.env.SYNC_LOOKBACK_DAYS = '30';
    process.env.SYNC_BATCH_SIZE = '100';

    const { loadConfig } = require('./config');
    const config = loadConfig();

    expect(config.sync.lookbackDays).toBe(30);
    expect(config.sync.batchSize).toBe(100);
  });

  it('should throw error for missing required variables', () => {
    process.env.MARKETO_CLIENT_ID = 'test-client-id';
    // Missing MARKETO_CLIENT_SECRET

    // Module initialization will throw error when trying to load config
    expect(() => {
      const { loadConfig } = require('./config');
    }).toThrow(/MARKETO_CLIENT_SECRET/);
  });

  it('should throw error for invalid numeric variables', () => {
    process.env.MARKETO_CLIENT_ID = 'test-client-id';
    process.env.MARKETO_CLIENT_SECRET = 'test-client-secret';
    process.env.MARKETO_ENDPOINT = 'https://test.mktorest.com';
    process.env.ALFRESCO_URL = 'https://alfresco.test.com';
    process.env.ALFRESCO_USERNAME = 'testuser';
    process.env.ALFRESCO_PASSWORD = 'testpass';
    process.env.SYNC_LOOKBACK_DAYS = 'not-a-number';

    // Module initialization will throw error when trying to load config
    expect(() => {
      const { loadConfig } = require('./config');
    }).toThrow(/must be a number/);
  });

  it('should load config structure correctly', () => {
    process.env.MARKETO_CLIENT_ID = 'test-client-id';
    process.env.MARKETO_CLIENT_SECRET = 'test-client-secret';
    process.env.MARKETO_ENDPOINT = 'https://test.mktorest.com';
    process.env.ALFRESCO_URL = 'https://alfresco.test.com';
    process.env.ALFRESCO_USERNAME = 'testuser';
    process.env.ALFRESCO_PASSWORD = 'testpass';

    const { loadConfig } = require('./config');
    const config = loadConfig();

    expect(config).toHaveProperty('marketo');
    expect(config).toHaveProperty('alfresco');
    expect(config).toHaveProperty('sync');
    expect(config.marketo).toHaveProperty('clientId');
    expect(config.marketo).toHaveProperty('clientSecret');
    expect(config.marketo).toHaveProperty('endpoint');
    expect(config.alfresco).toHaveProperty('url');
    expect(config.alfresco).toHaveProperty('username');
    expect(config.alfresco).toHaveProperty('password');
    expect(config.alfresco).toHaveProperty('basePath');
    expect(config.sync).toHaveProperty('lookbackDays');
    expect(config.sync).toHaveProperty('batchSize');
  });
});
