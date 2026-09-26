import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], headless: true } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], headless: true } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], headless: true } },
  ],
});
