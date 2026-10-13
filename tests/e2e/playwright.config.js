const { defineConfig, devices } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');

// Same interface as bcparks.ca's tests/e2e config: ENV picks env/.env.<ENV>,
// and BASE_URL (from that file or the environment) is required.
const environment = process.env.ENV || 'prod';
dotenv.config({ path: path.resolve(__dirname, `env/.env.${environment}`) });

if (!process.env.BASE_URL) {
  throw new Error(`BASE_URL is not set. Create env/.env.${environment} or set BASE_URL.`);
}

module.exports = defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL,
    actionTimeout: 15000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'full-chromium',
      testIgnore: /strapi-gatsby-comparison\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'strapi-gatsby-comparison',
      testMatch: /strapi-gatsby-comparison\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'full-firefox',
      testIgnore: /strapi-gatsby-comparison\.spec\.js/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'full-webkit',
      testIgnore: /strapi-gatsby-comparison\.spec\.js/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
