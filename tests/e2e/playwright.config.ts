import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
// Started by scripts/e2e.mjs, which provides E2E_BASE_URL and the test credentials.
// Same path as global-setup.ts.
const authFile = fileURLToPath(new URL('../../test-results/.auth.json', import.meta.url));
const viewports: [string, number, number][] = [['360', 360, 760], ['390', 390, 844], ['768', 768, 1024], ['1024', 1024, 768], ['1440', 1440, 900]];
export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  globalSetup: './global-setup.ts',
  timeout: 45_000,
  workers: 1,
  // One retry absorbs intermittent local network stalls; retried tests are reported as flaky, not hidden.
  retries: 1,
  reporter: [['list']],
  // Fake microphone so the real recorder can run without hardware; the fake UI accepts the prompt (granting permissions here would deny notifications).
  use: { baseURL: process.env.E2E_BASE_URL, channel: 'chrome', locale: 'pt-BR', screenshot: 'only-on-failure', storageState: authFile, launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
  projects: viewports.map(([name, width, height]) => ({ name, use: { viewport: { width, height } } })),
});
