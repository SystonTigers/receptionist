import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
    globals: true,
    include: ['**/*.test.{ts,tsx}']
  },
  resolve: {
    alias: {
      '@/components': path.resolve(__dirname, 'components'),
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/hooks': path.resolve(__dirname, 'hooks'),
      '@/styles': path.resolve(__dirname, 'styles'),
      '@/types': path.resolve(__dirname, '../..', 'packages/shared/src/types'),
      '@ai-hairdresser/shared': path.resolve(__dirname, '../..', 'packages/shared/src')
    }
  }
});
