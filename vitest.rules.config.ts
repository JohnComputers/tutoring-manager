import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Emulator-backed security-rules suite. Run via `npm run test:rules`, which wraps this
 * in `firebase emulators:exec` so the Firestore emulator is up for the duration.
 *
 * `fileParallelism: false` because every test shares one emulator instance and
 * `clearFirestore()` between tests would otherwise wipe a sibling file's data mid-run.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/rules.test.ts', 'src/__tests__/booking-concurrency.test.ts', 'src/__tests__/reminders.test.ts'],
    // One shared emulator instance: running files in parallel would let one file's
    // `clearFirestore()` wipe another's fixtures mid-test.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Populates `import.meta.env`, which is how `firebase/config.ts` reads its settings.
    // The values are deliberately fake — the emulator does not authenticate them, and
    // `VITE_USE_FIREBASE_EMULATOR` guarantees no request reaches a real project.
    env: {
      VITE_FIREBASE_API_KEY: 'emulator-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'rules-test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'rules-test',
      VITE_FIREBASE_STORAGE_BUCKET: 'rules-test.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:emulatoronly',
      VITE_USE_FIREBASE_EMULATOR: 'true',
    },
  },
});
