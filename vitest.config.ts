import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, './src/config'),
      '@core': path.resolve(__dirname, './src/core'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@identity': path.resolve(__dirname, './src/modules/identity/index.ts'),
      '@clients': path.resolve(__dirname, './src/modules/clients/index.ts'),
      '@events': path.resolve(__dirname, './src/modules/events/index.ts'),
      '@forms': path.resolve(__dirname, './src/modules/forms/index.ts'),
      '@pricing': path.resolve(__dirname, './src/modules/pricing/index.ts'),
      '@access': path.resolve(__dirname, './src/modules/access/index.ts'),
      '@registrations': path.resolve(__dirname, './src/modules/registrations/index.ts'),
      '@drafts': path.resolve(__dirname, './src/modules/drafts/index.ts'),
      '@reports': path.resolve(__dirname, './src/modules/reports/index.ts'),
    },
  },
});
