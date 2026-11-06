# Tutorly · Tutoring Manager

An owner-only React/Vite/TypeScript workspace for John Williams’s existing tutoring practice. The frontend is public on GitHub Pages; student records, calendar details, notes, finances, and settings require the **existing Firebase owner account and `admins/{uid}` membership**.

- Workspace: https://johncomputers.github.io/tutoring-manager/
- Public booking site: https://johncomputers.github.io/math-tutoring/
- Shared Firebase project: `johns-tutoring` (no new project or calendar database)

## Daily use

Sign in with the same credentials as the tutoring website’s admin area. The dashboard shows today, the next lesson, teaching hours, earned revenue, balances, and recent progress notes. The calendar supports day/week/month/agenda, a mini calendar, student/status filters, global search, drag/drop, resize, and click-to-create. Changes commit to the original `bookings` and `slotLocks` collections and appear in both apps through live listeners.

Create student profiles before adding manual lessons. Profiles include guardian contacts, grade/school, subjects/course level, rates, duration, color, tags, goals, materials, strengths, areas to work on, private notes, custom fields, and scheduling/billing notes. The timeline contains attendance, lessons, and session notes. Incoming website bookings are linked automatically only when a student name and normalized guardian email/phone identify one profile. New contacts get separate profiles. Ambiguous matches wait in Booking inbox; the system never merges profiles.

In a lesson, record topics, progress, homework, next steps, price, and partial/full payments. Payment history is append-only in the UI. Canceled lessons remain in history and release reservations. Completed/no-show lessons release their reservations too. Reopening requires Edit so reservations are checked again. Tentative and custom active statuses continue to reserve time.

Recurring lessons are **finite, real occurrences**, not decorative recurrence rules. Choose 1–24 occurrences every 1, 2, or 4 weeks. A series saves atomically, subject to the transaction’s write limit; shorten very large series when prompted. Edit/cancel one occurrence to make an exception. Local lesson time stays constant across DST; nonexistent spring-forward times are rejected. New fall-back ambiguous times use the original scheduler’s deterministic first occurrence; editing an existing lesson preserves its exact UTC instant. Buffers reserve actual UTC time, including across midnight. Teaching time must fit published open hours; buffers may extend beyond those hours and still prevent other lessons.

Availability publishes to the public website. Multiple weekly windows implement breaks. Date/range overrides close days, subtract time windows, replace hours, or add hours. Repeating weekday overrides are materialized over the chosen finite range. Changes preserve existing lessons; conflicts on affected dates are explained before publication. The dashboard and inbox flag upcoming lessons outside current hours or in a reservation overlap. A new manual lesson outside published hours requires an explicit override, and an overlap with a lesson/buffer is always rejected. Overnight weekly windows split automatically onto adjacent days; manual lessons can cross midnight.

Reports filter by date, student/subject search, and group by student, subject, week, or month. Export session/payment CSV or print the summary. Student import accepts CSV/JSON using exported field names; `rate` is integer cents. It skips exact contact/name duplicates and reports partial import failures without deleting successfully imported rows. CSV exports escape spreadsheet formula prefixes.

Optional profile fields can be shown/hidden with checkboxes and reordered with up/down controls. Settings persist in owner-only Firestore documents: light/dark/system theme, accent, calendar coloring, increments, 12/24-hour time, week start, defaults, optional profile field visibility/order, tags/statuses, dashboard widgets, and notifications. Shortcuts: **Ctrl/⌘ K** command palette, **N** new lesson, **/** search; in Calendar, **T** today, **D/W/M/A** views, arrows previous/next.

## Setup checklist

Firebase configuration, the authorized GitHub Pages domain, the existing owner allowlist, disabled public signup, and the dedicated Actions service account are configured. `SMTP_USER` and `OWNER_EMAIL` are also configured from the existing owner record. The only missing credential is `SMTP_PASSWORD`. Reminders remain disabled until Gmail delivery is tested. See `AUDIT.md` for verification evidence.

1. In [repository Actions secrets](https://github.com/JohnComputers/tutoring-manager/settings/secrets/actions), add:
   - `SMTP_USER`: your sending Gmail address.
   - `SMTP_PASSWORD`: a Gmail **app password**, not your ordinary password. [Google’s setup instructions](https://support.google.com/accounts/answer/185833) explain the 2-Step Verification prerequisite and account restrictions.
   - `OWNER_EMAIL`: your reminder recipient. It must match the recipient saved in Settings. The runner uses this secret as an explicit recipient allowlist.
2. `FIREBASE_SERVICE_ACCOUNT` must contain the dedicated service-account JSON. The automated setup creates `tutoring-manager-reminders@johns-tutoring.iam.gserviceaccount.com`, grants only `roles/datastore.user`, and pipes the key directly into this repository secret. It never writes key material to the repository or local disk. If organization policy prevents keys, supply an approved credential through the same secret; do not grant project Editor/Owner.
3. In the app, Settings → notifications: choose your recipient/timezone, lead times (default 1440 and 60 minutes), agenda hour, quiet hours, notification types, and templates. Save and enable reminders.
4. Run [Owner reminders](https://github.com/JohnComputers/tutoring-manager/actions/workflows/reminders.yml) manually with **test = true**, or queue a test from Settings. Confirm receipt. Until SMTP secrets are supplied and delivery is tested, email setup is incomplete.
5. Confirm the [rolling availability workflow](https://github.com/JohnComputers/tutoring-manager/actions/workflows/availability.yml) succeeds. It renews the booking horizon daily without changing existing reservations.

No student/guardian address is ever an email recipient. No Cloud Functions, Firebase Storage, payment processor, paid calendar license, or continuously running server is used by the manager. The old site’s optional photo uploader is preserved.

## Email behavior and operational limits

GitHub Actions runs at minutes 3, 18, 33, and 48 of each hour. It does not require your browser or computer to remain open. Cron delivery is **not exact-time guaranteed**: GitHub can delay or drop scheduled runs. The runner checks a persistent cursor with overlapping lookback windows bounded to 72 hours, and skips reminders for lessons already started. Quiet hours defer normal emails. Test emails bypass quiet hours. Daily/weekly summaries use the configured timezone.

The Firestore outbox claims each deterministic event transactionally, uses a lease, and records sent/failed/uncertain state. Repeated/concurrent runs do not resend sent events. Definitive SMTP failures retry with backoff, up to five attempts. If the SMTP connection fails after delivery may have happened, or a worker dies after claiming, the event becomes **uncertain** rather than risking an automatic duplicate. Check Delivery history and your inbox before a deliberate retry. SMTP and Firestore cannot offer a shared exactly-once transaction.

[GitHub’s schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) also notes that scheduled workflows in inactive public repositories can be disabled after 60 days. Re-enable them in Actions if needed. Keep Actions failure notifications enabled for your account. The availability workflow fails closed if it cannot renew permits; it does not invent open hours.

The architecture can operate at $0 using GitHub Pages, standard runners in a public repository, Firebase Spark, and an existing Gmail account. There is no app-imposed student count limit, but **Firebase’s storage/read/write quotas still apply**; this is not unlimited free infrastructure. See [Firestore usage limits](https://firebase.google.com/docs/firestore/quotas). Hitting a quota causes a visible error; it does not silently switch to a paid service. No billing upgrade is required by this implementation.

## Local development and tests

Use Node 22 and Java 17+ (CI uses Java 21).

```sh
npm ci
cp .env.example .env.local
# Fill the same public Firebase identifiers used by math-tutoring.
npm run dev
npm test
npm run test:rules
npm run build
```

The Vite base defaults to `/tutoring-manager/`; HashRouter supports direct refreshes on Pages. `.env.local` is ignored. Firebase web identifiers are public client configuration; security comes from rules and the existing admin allowlist. Never put SMTP passwords or service-account keys in `VITE_*` variables.

Emulator tests use `rules-test`, port 8080 for Firestore and 9099 for Auth, and fake client configuration. They exercise 8-way concurrent booking, cancellation/release, rescheduling, all-or-nothing recurrence, availability conflicts, real listeners, forged legacy lock IDs, unauthorized reads/writes, closed-hour enforcement, midnight boundaries, and persistent notification idempotency/retries. Tests never seed real customer data. Optional browser smoke testing uses `scripts/browser-smoke.mjs` and Playwright; its screenshots are ignored.

## Shared schema and security

| Collection | Access | Purpose |
| --- | --- | --- |
| `admins` | Own document read; Admin SDK manages membership | Existing owner role |
| `settings`, `subjects`, `testimonials`, `exceptions` | Public read, owner write | Existing public site/CMS and hours |
| `bookings` | Owner read/edit; validated public create | Original calendar source of truth |
| `slotLocks` | Public read; linked public create; owner release | Original atomic 5-minute reservation grains |
| `dayClaims` | Public read; exact atomic occupancy delta for public writes | UTC-day bitmap closes forged/missing grain bypasses |
| `availabilityDays` | Public read, owner write | Revisioned allowed-hour bitmap and timezone offsets checked by rules |
| `students`, `sessionDetails`, `payments` | Owner only | CRM, session notes/prices/links, payment history |
| `managerSettings` | Owner only | Preferences and email settings, never SMTP credentials |
| `history` | Owner read/create, immutable from clients | Lesson changes |
| `notificationRequests` | Owner read/create | Test-email queue |
| `notificationState`, `notificationLogs`, `migrations` | Owner read, privileged worker write | Idempotency, sanitized delivery logs, migration records |

Every scheduling mutation uses an online Firestore transaction. There is no persistent Firestore browser cache or localStorage CRM store; Firebase’s existing authentication persistence stores the sign-in session only. Offline calendar writes are refused. Availability publication and all future permits share one revision switch, so concurrent booking transactions retry or fail against the new schedule. Cancellations and reschedules release only locks actually owned by the lesson.

Rules verify public booking shape, duration, configured lengths, notice/advance limits, timezone, buffers, current availability revision, allowed UTC intervals, and an exact vacant-to-occupied daily bitmap change. Therefore skipping or forging a grain list cannot create an overlap. Public reads of private collections are denied for both anonymous and signed-in non-admin users. Public settings/exceptions/lock markers must contain no private reasons or student information. Custom administrator code remains privileged; client rules cannot protect an owner from intentionally issuing arbitrary owner writes.

Rules also validate the local date label, same-day policy, and the complete final local date of the advance window. Each public permit contains timezone offsets and clock transitions so these checks respect DST without trusting the booking client. Availability boundaries use five-minute increments. New sessions respect current settings; existing sessions stay visible when hours change. Owner sessions can extend beyond the public booking horizon while still respecting weekly hours and exceptions. Each availability publication is bounded to 400 advance days and at most 30 date overrides per operation. DST and midnight tests cover the shared interval math.

## Migration, deployment, and recovery

`src/shared/engine.ts`, `src/utils/slots.ts`, the shared types, and `firestore.rules` must remain identical in both repositories. Update/test both when changing reservation behavior. Existing composite indexes are retained; new listeners use single-field indexes.

For a fresh installation, coordinate the non-destructive migration, matching shared rules in `johns-tutoring`, and both frontends. This project has already been migrated; do not rerun its migration. When upgrading an existing bitmap-only installation, run the current rolling refresh first so every public day has timezone offsets and transitions, then deploy the matching rules and frontends. The migration backfills day occupancy from existing locks and publishes the revisioned rolling window; it does not modify/remove bookings, customers, payments, or owner membership. Refresh old open public tabs after deployment because older clients do not supply the stronger claim protocol.

```sh
npm run deploy:rules
# Either supply FIREBASE_SERVICE_ACCOUNT securely, use ADC, or use an existing local CLI login:
USE_FIREBASE_CLI_AUTH=1 MIGRATION_APPLY=true npm run migrate
```

The migration must run only during the coordinated v2 cutover; do not rerun a live backfill over concurrent production booking traffic. Daily renewal uses `scripts/refresh-availability.ts`, which never rewrites occupancy. Migration defaults to a dry run unless explicitly enabled.

Push `main` to deploy through GitHub Actions. Pages must use **GitHub Actions** as its source. Both repositories retain identical rules/indexes, while the original site keeps its CMS, marketing content, legal pages, subjects, testimonials, and optional Storage integration. Frontend rollback uses a previous commit; do not roll back only one repository’s reservation protocol. A coordinated rollback also restores matching rules and requires checking all live reservations. No automatic destructive migration or bulk deletion runs.

MVP limits: recurrence edits are per occurrence; there is no unbounded recurring-series expansion, automated student email, bulk series editor, refund processor, or offline booking queue. The PWA is optional and not implemented. The application uses no fake lessons, balances, or integrations.
