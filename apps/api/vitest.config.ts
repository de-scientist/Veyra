import { defineConfig } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';

const envPath = new URL('../../.env', import.meta.url);
const envContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && !process.env[key.trim()]) {
    process.env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
}

export default defineConfig({
  configFile: false,
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
