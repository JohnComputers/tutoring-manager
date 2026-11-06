import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Test configuration.
 *
 * Two suites with different requirements:
 *
 *   - unit tests (`src/utils/**`) are pure functions and run anywhere, instantly;
 *   - rules tests (`src/__tests__/rules.test.ts`) need the Firestore emulator, which
 *     needs Java, so they are excluded from the default run and invoked through
 *     `npm run test:rules`, which starts the emulator around them.
 *
 * Keeping them separate means `npm test` never fails on a machine without Java, and
 * nobody is tempted to skip the security tests because they are slow.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Everything in `src/__tests__` needs the Firestore emulator; those run under
    // `npm run test:rules`, which starts it. Excluding them keeps `npm test` fast and
    // runnable on a machine without Java.
    exclude: ['**/node_modules/**', 'src/__tests__/**'],
    testTimeout: 20_000,
  },
});
