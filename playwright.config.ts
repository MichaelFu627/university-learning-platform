import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PORT: '3100',
      DATA_DIR: mkdtempSync(path.join(tmpdir(), 'unistudy-e2e-')),
      AI_API_KEY: '',
      AI_MODEL: '',
      EMBEDDING_MODEL: '',
      SOFFICE_PATH: '',
      SMTP_HOST: '',
    },
  },
});
