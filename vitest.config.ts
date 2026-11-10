import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next/**', 'nhap-trau-app/**'],
  },
});

