import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: isCI ? 'http://localhost:3000' : 'http://localhost:5173',
    trace: 'on-first-retry'
  },
  webServer: isCI
    ? {
        command:
          'npm run build --workspace=@workspace/web && npm run start --workspace=@workspace/web',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120 * 1000,
        env: {
          SKYDOCK_OUTPUT_DIR: '/tmp/playwright-output',
          PORT: '3000',
          HOST: '0.0.0.0'
        }
      }
    : {
        command: 'npm run dev --workspace=@workspace/web',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120 * 1000,
        env: {
          SKYDOCK_OUTPUT_DIR: '/tmp/playwright-output'
        }
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
