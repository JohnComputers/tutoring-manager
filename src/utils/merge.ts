/**
 * Deep-merge stored settings over their defaults.
 *
 * Why this exists: a Firestore document written by an older version of the app will be
 * missing any field added since. Without a merge, `settings.hero.eyebrow` comes back
 * `undefined` and React renders a blank where a heading should be. Merging over the
 * defaults means new fields appear with sensible values until the admin edits them, and
 * no migration step is needed on deploy.
 *
 * Arrays are replaced wholesale, never merged element-wise — an admin who deletes the
 * third selling point means it to stay deleted, not to be resurrected from the defaults.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    // Firestore Timestamps and Dates are values, not structures to recurse into.
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(value)
        ? deepMerge(baseValue, value)
        : value;
  }
  return result as T;
}
