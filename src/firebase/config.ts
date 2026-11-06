import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { type Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import {
  type FirebaseStorage,
  connectStorageEmulator,
  getStorage,
} from 'firebase/storage';

/**
 * Firebase client configuration.
 *
 * These values are *not* secrets. A Firebase web config is embedded in every client that
 * talks to the project, and Google documents it as public. What actually protects the
 * data is Firestore/Storage security rules (see `firestore.rules`, `storage.rules`) —
 * which is why those rules deny everything they do not explicitly permit.
 *
 * They still live in environment variables so the repository is not tied to one Firebase
 * project and so forks do not accidentally write into someone else's database.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

/** Env vars that are missing or still contain a placeholder value. */
export function missingFirebaseKeys(): string[] {
  const values: Record<string, string | undefined> = {
    VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
    VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
    VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
    VITE_FIREBASE_APP_ID: firebaseConfig.appId,
  };
  return REQUIRED_KEYS.filter((key) => {
    const value = values[key];
    return !value || value.startsWith('your-') || value.includes('XXXX');
  });
}

export const isFirebaseConfigured = (): boolean => missingFirebaseKeys().length === 0;

/**
 * Point the SDK at the local Firebase emulators instead of the real project.
 *
 * Set `VITE_USE_FIREBASE_EMULATOR=true` to develop and test against `npm run emulators`
 * without touching live bookings — and, importantly, against the *real* security rules,
 * so a rules mistake shows up locally rather than in production.
 */
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

let app: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

function getApp(): FirebaseApp {
  if (app) return app;
  if (!isFirebaseConfigured()) {
    throw new Error(
      `Firebase is not configured. Missing: ${missingFirebaseKeys().join(', ')}. ` +
        'Copy .env.example to .env and fill in your project values.',
    );
  }
  app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function db(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getApp());
    if (useEmulator) connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080);
  }
  return firestoreInstance;
}

export function auth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
    if (useEmulator) {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    // Keep the admin signed in across refreshes and tab closes. `setPersistence`
    // resolves asynchronously; failures are non-fatal (the session just becomes
    // in-memory only), so we log rather than reject.
    void setPersistence(authInstance, browserLocalPersistence).catch((error: unknown) => {
      console.warn('[firebase] Could not enable local auth persistence.', error);
    });
  }
  return authInstance;
}

export function storage(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getApp());
    if (useEmulator) connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
  }
  return storageInstance;
}

export const projectId = firebaseConfig.projectId;
