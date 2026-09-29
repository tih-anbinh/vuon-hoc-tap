// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-29
//
// Playwright config for Read Oasis browser end-to-end tests.
// The app is a static, local-first site with no build step, so we serve it with
// Python's http.server (already a project dependency) on a fixed port and drive
// real Chromium against it. Service-worker + Cache Storage require an http origin
// (not file://), which this provides — enabling the offline flow test.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.RO_E2E_PORT || 4321);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,           // one static server; keep runs deterministic
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Deterministic viewport ~ a small tablet in portrait (the target device class).
    viewport: { width: 820, height: 1180 },
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `python -m http.server ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
