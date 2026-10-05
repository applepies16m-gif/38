import { defineConfig } from '@playwright/test';

// Settings for the end-to-end tests (npm run e2e).
//
// Playwright opens a real browser and uses the site the way a
// person would. Before the tests it starts two things of its own:
//   1. the server, on port 3100, with an empty test database;
//   2. the Angular app, on port 4300, built to talk to that server.
// So the tests can run alongside the normal app (ports 3000 and
// 4200) and never touch real data. MongoDB must be running.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // The steps share one database and build on each other, so they
  // run one at a time, in order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4300',
    // Use the Microsoft Edge already installed on this computer,
    // which avoids downloading a separate browser.
    channel: 'msedge',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node e2e/start-test-server.js',
      url: 'http://localhost:3100/api/bootstrap-status',
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: 'npx ng serve --configuration e2e --port 4300',
      url: 'http://localhost:4300',
      reuseExistingServer: false,
      timeout: 240_000,
      env: { NG_CLI_ANALYTICS: 'false' }
    }
  ]
});
