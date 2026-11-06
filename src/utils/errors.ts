/**
 * Turns raw Firebase/network failures into sentences a parent can act on.
 *
 * Two rules here:
 *   - the *user* sees a plain explanation and a next step, never a Firebase error code;
 *   - the *console* keeps the original error, because "permission-denied on
 *     bookings/abc" is the only thing that makes a rules bug debuggable.
 */

/** Error the booking flow throws when the chosen time was taken mid-submit. */
export class SlotTakenError extends Error {
  readonly code = 'slot-taken';
  constructor(message = 'That time was just booked by someone else.') {
    super(message);
    this.name = 'SlotTakenError';
  }
}

/** Error thrown when form data fails validation before it reaches Firestore. */
export class ValidationError extends Error {
  readonly code = 'validation';
  readonly fields: Record<string, string>;
  constructor(fields: Record<string, string>, message = 'Please check the form.') {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

interface FirebaseLikeError {
  code?: string;
  message?: string;
}

function asFirebaseError(error: unknown): FirebaseLikeError {
  if (typeof error === 'object' && error !== null) return error as FirebaseLikeError;
  return {};
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That does not look like a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/too-many-requests':
    'Too many sign-in attempts. Wait a few minutes and try again.',
  'auth/network-request-failed':
    'Could not reach the authentication server. Check your connection.',
  'auth/operation-not-allowed':
    'Email/password sign-in is not enabled for this Firebase project yet.',
};

const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied':
    'You do not have permission to do that. If you are signed in as an admin, your account may not be on the admin list yet.',
  unavailable:
    'Could not reach the server. Check your internet connection and try again.',
  'deadline-exceeded': 'The request took too long. Please try again.',
  'failed-precondition':
    'The database rejected the request. If this is a fresh project, the Firestore indexes may still be building.',
  'resource-exhausted': 'The service is busy right now. Please try again in a moment.',
  aborted: 'Another change happened at the same time. Please try again.',
  'already-exists': 'That record already exists.',
  'not-found': 'That record no longer exists.',
  unauthenticated: 'Your session expired. Please sign in again.',
  cancelled: 'The request was cancelled.',
};

const STORAGE_MESSAGES: Record<string, string> = {
  'storage/unauthorized':
    'You do not have permission to upload files. Check that your account is on the admin list.',
  'storage/canceled': 'The upload was cancelled.',
  'storage/quota-exceeded': 'The storage quota for this project is full.',
  'storage/retry-limit-exceeded':
    'The upload kept failing. Check your connection and try a smaller image.',
  'storage/invalid-checksum': 'The file was corrupted in transit. Please try again.',
  'storage/unknown':
    'The upload failed. If this keeps happening, check that Firebase Storage is enabled and its rules are deployed.',
};

/**
 * A user-facing message for any thrown value.
 *
 * @param error    the caught value, of any shape
 * @param fallback what to say when nothing more specific is known
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof SlotTakenError) return error.message;
  if (error instanceof ValidationError) return error.message;

  const fb = asFirebaseError(error);
  const code = typeof fb.code === 'string' ? fb.code : '';

  if (code in AUTH_MESSAGES) return AUTH_MESSAGES[code] as string;
  if (code in FIRESTORE_MESSAGES) return FIRESTORE_MESSAGES[code] as string;
  if (code in STORAGE_MESSAGES) return STORAGE_MESSAGES[code] as string;

  // Offline detection beats any code-based guess.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Reconnect and try again.';
  }

  if (error instanceof Error && /network|fetch|failed to fetch/i.test(error.message)) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }

  if (error instanceof Error && error.message.startsWith('Firebase is not configured')) {
    return error.message;
  }

  return fallback;
}

/** Log the developer-facing detail without leaking it into the UI. */
export function logError(context: string, error: unknown): void {
  const fb = asFirebaseError(error);
  console.error(`[${context}]`, fb.code ?? 'operation-failed');
}

/** Log and translate in one step — the pattern nearly every catch block wants. */
export function handleError(context: string, error: unknown, fallback?: string): string {
  logError(context, error);
  return friendlyError(error, fallback);
}
