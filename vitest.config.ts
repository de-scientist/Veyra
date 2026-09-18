import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const envContent = readFileSync(new URL('./.env', import.meta.url), 'utf8');
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key && !process.env[key.trim()]) {
    process.env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@veyra/config': './packages/config/src/index.ts',
      '@veyra/types': './packages/types/src/index.ts',
      '@veyra/validation': './packages/validation/src/index.ts',
    },
  },
});
