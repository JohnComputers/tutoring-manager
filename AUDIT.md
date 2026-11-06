# Existing tutoring system audit

Source audited: `JohnComputers/math-tutoring`, initial HEAD `b162d31ed5611d4fe0b2b9aab04ebe4e9fb9c0c7`. Live frontend and Firebase client configuration were inspected. Authorized read access confirmed the existing `johns-tutoring` database and one existing admin membership. No customer details or credentials are included in this report.

## Original architecture

- React 18, TypeScript, Vite, HashRouter, Lucide, Firebase client SDK; GitHub Pages Actions deployment.
- Email/password Auth. Firestore `admins/{uid}` is the role boundary. Custom admin claims remain available for the old optional Storage uploader.
- Public marketing/CMS: `settings/site`, `settings/legal`, `subjects`, `testimonials`. Scheduling is `settings/scheduling`, with an IANA timezone, weekly windows, notice/advance settings, durations, and post-session buffer.
- `exceptions`: blockAll/replace/add overrides by local date, publicly readable. Reasons must not contain private data.
- `bookings`: guardian/student contacts, timing, status, confirmation, internal notes, and grain IDs. Public creation, owner-only reads.
- `slotLocks/g{epochFiveMinuteGrain}`: publicly readable opaque occupancy. The original booking transaction reads each grain before atomically reserving it. Reschedule diffs locks; cancellation releases owned locks.
- Date utilities use `Intl` wall-clock conversion and round-trip checks for DST gaps. Existing tests cover time, slot generation, and form validation.

## Findings and changes

1. Original public rules validated booking shape but did not require every reservation or enforce configured hours. The added `dayClaims` exact bitmap delta prevents overlapping public creates even when a hostile client omits grain documents. `availabilityDays` revisioned permits enforce actual open UTC intervals without a paid backend.
2. Public exceptions were one-time fetches and returned an empty array on errors, which could visually reopen blocked hours. Reads now subscribe live and fail closed.
3. Scheduling and owner booking pages used one-time reads. Shared settings, reservations/claims, and owner booking listeners now propagate both directions.
4. CRM/payment data must not be added to public settings/exceptions. It lives only in owner-protected collections; links and session notes/prices stay in `sessionDetails`.
5. Reservations remain the original 5-minute grains. Both apps call the same transaction implementation. Additional UTC-day bitmaps are an enforcement layer, not a duplicate calendar.
6. Public account creation was enabled in the existing Firebase Auth configuration. It is now disabled; the existing owner account and allowlist remain intact.
7. Scheduled owner notifications use an independent least-privilege Firestore worker identity. Its key is stored only as a GitHub Actions secret; Gmail credentials are never part of the frontend.

## Verified setup

- New public GitHub repository created: `JohnComputers/tutoring-manager`.
- Existing six Firebase web identifiers reused as repository Actions secrets and ignored local development configuration.
- `johncomputers.github.io` already exists in Firebase authorized domains, so the new path needs no additional domain.
- Dedicated `tutoring-manager-reminders` service account configured with `roles/datastore.user`; its JSON key piped directly into `FIREBASE_SERVICE_ACCOUNT` in the new repository.
- Public Firebase signup disabled after confirming the existing owner account.
- Final deployment, migration, and test evidence is recorded below after verification.

## Remaining external credential

Gmail SMTP/app-password setup requires the owner’s Google account security flow. No Gmail app password was available in this session. Add the SMTP/recipient Actions secrets described in README, enable the desired preferences, and send the owner-only test. Actual Gmail delivery cannot be claimed before that step succeeds.
