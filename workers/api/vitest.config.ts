import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@ai-hairdresser/shared': path.resolve(__dirname, '../..', 'packages/shared/src')
    }
  }
});
