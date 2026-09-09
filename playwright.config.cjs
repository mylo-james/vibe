const { defineConfig } = require('@playwright/test');
const { testEnvironment } = require('./tests/database.cjs');
module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4334', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'node -r dotenv/config bin/www',
    gracefulShutdown: { signal: 'SIGINT', timeout: 5000 },
    url: 'http://127.0.0.1:4334/health',
    env: {
      ...testEnvironment(),
      HOST: '127.0.0.1',
      PORT: '4334',
      ...(process.env.VIBE_COVERAGE_DIR ? { NODE_V8_COVERAGE: process.env.VIBE_COVERAGE_DIR } : {}),
    },
    reuseExistingServer: false,
  },
});
