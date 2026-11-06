import type { Timestamp } from 'firebase/firestore';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Minutes from local midnight, e.g. 18:30 -> 1110. Always in the site timezone. */
export type MinutesOfDay = number;

/** 0 = Sunday ... 6 = Saturday, matching `Date.prototype.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Calendar date in the site timezone, `YYYY-MM-DD`. Never a UTC date. */
export type IsoDate = string;

/* ------------------------------------------------------------------ */
/* settings/site                                                       */
/* ------------------------------------------------------------------ */

export interface HeroContent {
  heading: string;
  subheading: string;
  /** Short blurb rendered under the portrait. */
  intro: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  /** Small pill above the heading, e.g. "Middle school through Algebra 2". */
  eyebrow: string;
}

export interface AboutContent {
  heading: string;
  /** Multi-paragraph plain text. Blank lines separate paragraphs. */
  bio: string;
  /** Free-form lines; each renders as a badge with a check icon. */
  qualifications: string[];
  teachingPhilosophyHeading: string;
  teachingPhilosophy: string;
  /** Firebase Storage download URL, or '' when no photo has been uploaded yet. */
  photoUrl: string;
  /** Storage path of the current photo, so a replacement can delete the old object. */
  photoStoragePath: string;
  photoAlt: string;
}

export interface SellingPoint {
  id: string;
  title: string;
  body: string;
  /** Key into the icon registry in `src/components/ui/Icon.tsx`. */
  icon: string;
}

export interface WhyContent {
  heading: string;
  subheading: string;
  points: SellingPoint[];
}

export interface PricingTier {
  id: string;
  label: string;
  /** Minutes. Must be a positive multiple of `SLOT_GRAIN_MINUTES`. */
  durationMinutes: number;
  /** Whole currency units (dollars). Stored as a number, formatted for display. */
  price: number;
  description: string;
  /** Shows a "Most popular" ribbon. At most one tier should set this. */
  featured: boolean;
  /** Hidden tiers stay in the data model but are not rendered publicly. */
  visible: boolean;
}

export interface PricingContent {
  heading: string;
  subheading: string;
  /** Displayed under the tiers, e.g. payment/cancellation notes. */
  note: string;
  currencySymbol: string;
  tiers: PricingTier[];
}

export interface SocialLink {
  id: string;
  label: string;
  url: string;
  icon: string;
}

export interface ContactContent {
  heading: string;
  subheading: string;
  phone: string;
  /** Optional. Empty string means "not shown". */
  email: string;
  /** Text on the call/text button, e.g. "Text 786-452-6881". */
  phoneCtaLabel: string;
  /** Optional location line, e.g. "Online and in person". */
  location: string;
  socials: SocialLink[];
}

export interface ScheduleCtaContent {
  heading: string;
  subheading: string;
  buttonLabel: string;
}

export interface SeoContent {
  title: string;
  description: string;
  /** Absolute URL used for canonical + og:url. Empty disables the tags. */
  canonicalUrl: string;
  /** Absolute URL to an og:image. Empty disables the tag. */
  ogImageUrl: string;
}

export interface FooterContent {
  tagline: string;
  /** `{year}` is substituted at render time. */
  copyright: string;
}

export interface ThemeSettings {
  /** Hex colours. Applied as CSS custom properties at runtime. */
  primary: string;
  cream: string;
  coral: string;
  light: string;
  dark: string;
}

export interface SiteSettings {
  businessName: string;
  tutorName: string;
  /** Positioning line, e.g. "High School AP Calculus Student & Competitive Mathematician". */
  tagline: string;
  hero: HeroContent;
  about: AboutContent;
  why: WhyContent;
  pricing: PricingContent;
  contact: ContactContent;
  scheduleCta: ScheduleCtaContent;
  testimonialsHeading: string;
  testimonialsSubheading: string;
  subjectsHeading: string;
  subjectsSubheading: string;
  seo: SeoContent;
  footer: FooterContent;
  theme: ThemeSettings;
  updatedAt?: Timestamp;
}

/* ------------------------------------------------------------------ */
/* settings/scheduling                                                 */
/* ------------------------------------------------------------------ */

export interface AvailabilityPeriod {
  /** Minutes from midnight, inclusive. */
  start: MinutesOfDay;
  /** Minutes from midnight, exclusive. Must be > start. */
  end: MinutesOfDay;
}

export interface WeeklyAvailabilityDay {
  enabled: boolean;
  periods: AvailabilityPeriod[];
}

/** Indexed by weekday number 0-6. */
export type WeeklyAvailability = Record<Weekday, WeeklyAvailabilityDay>;

export type ExceptionKind =
  /** Whole day unavailable, overriding the weekly schedule. */
  | 'blockAll'
  /** Replaces the weekly schedule for that date with `periods`. */
  | 'replace'
  /** Adds `periods` on top of the weekly schedule for that date. */
  | 'add'
  /** Removes these windows from the day's resolved hours. */
  | 'subtract';

export interface AvailabilityException {
  id: string;
  date: IsoDate;
  kind: ExceptionKind;
  /** Ignored for `blockAll`. */
  periods: AvailabilityPeriod[];
  /** Admin-facing label, e.g. "Regional math competition". Never shown publicly. */
  reason: string;
  createdAt?: Timestamp;
}

export interface SchedulingSettings {
  /** IANA identifier, e.g. "America/New_York". DST is handled by Intl. */
  timezone: string;
  /** Minutes. Must be one of `sessionDurations`. */
  defaultDurationMinutes: number;
  /** Bookable session lengths in minutes, ascending. */
  sessionDurations: number[];
  /** Minutes of protected time after each session. Slots respect it on both sides. */
  bufferMinutes: number;
  /** A slot must start at least this many minutes from now. */
  minimumNoticeMinutes: number;
  /** How far ahead the calendar opens, in days from today. */
  maximumAdvanceDays: number;
  /** Master switch for Saturday/Sunday, independent of the weekly toggles. */
  weekendsEnabled: boolean;
  allowSameDayBookings: boolean;
  requireParentEmail: boolean;
  studentNotesEnabled: boolean;
  /** Shown above the booking form. */
  bookingIntro: string;
  /** Privacy reassurance rendered next to the student-name field. */
  privacyNotice: string;
  weekly: WeeklyAvailability;
  updatedAt?: Timestamp;
}

/* ------------------------------------------------------------------ */
/* settings/legal                                                      */
/* ------------------------------------------------------------------ */

export interface LegalDocument {
  title: string;
  /** Markdown-lite: `## ` headings, `- ` bullets, blank-line paragraphs. */
  body: string;
  /** Free text, e.g. "August 2026". Displayed as "Last updated: ...". */
  lastUpdated: string;
}

export interface LegalSettings {
  privacy: LegalDocument;
  terms: LegalDocument;
  cancellation: LegalDocument;
  guardian: LegalDocument;
  accessibility: LegalDocument;
  updatedAt?: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export interface Subject {
  id: string;
  name: string;
  description: string;
  /** Key into the icon registry. */
  icon: string;
  /** Optional, e.g. "Grades 6-8". Empty hides the chip. */
  gradeRange: string;
  /** Optional per-subject price override; empty string means "use standard rate". */
  priceLabel: string;
  /** Ascending display order. */
  order: number;
  visible: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Testimonial {
  id: string;
  /** Display name only. Never a full student name — see the privacy rules. */
  author: string;
  /** e.g. "Parent of an Algebra 1 student". */
  relationship: string;
  quote: string;
  /** 1-5, or 0 for "no rating shown". */
  rating: number;
  order: number;
  visible: boolean;
  createdAt?: Timestamp;
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'noShow';

export interface Booking {
  id: string;
  /** Human-friendly reference shown to the parent, e.g. "JW-7K2M9Q". */
  confirmationCode: string;

  parentName: string;
  studentName: string;
  phone: string;
  /** Optional; '' when not supplied. */
  email: string;
  /** Optional subject name (free text copied from the picker); '' when not supplied. */
  subject: string;
  /** Optional; '' when not supplied. */
  notes: string;

  /** Instant the session starts. */
  startAt: Timestamp;
  /** Instant the session ends (start + durationMinutes). Excludes buffer. */
  endAt: Timestamp;
  durationMinutes: number;

  /** Denormalised for cheap admin queries and display; site timezone at booking time. */
  dateKey: IsoDate;
  timezone: string;

  status: BookingStatus;
  /** Admin-only free text. Never returned to the public. */
  internalNotes: string;

  /**
   * Grain indices (see `utils/slots.ts`) reserved by this booking, buffer included.
   * Stored so a cancellation can release exactly what was taken.
   */
  lockIds: string[];

  policyAcceptedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  cancelledAt?: Timestamp;
  /** 'admin' | 'public' — who cancelled. */
  cancelledBy?: string;
}

/** Data captured by the public booking form, before any server-side stamping. */
export interface BookingFormValues {
  parentName: string;
  studentName: string;
  phone: string;
  email: string;
  subject: string;
  notes: string;
  policyAccepted: boolean;
}

/**
 * Publicly readable reservation marker. Contains no personal information: the public
 * needs to know *that* a grain is taken, never *who* took it.
 */
export interface SlotLock {
  id: string;
  /** Grain index — floor(utcEpochMinutes / SLOT_GRAIN_MINUTES). Range-queried per day. */
  grain: number;
  bookingId: string;
  createdAt: Timestamp;
}

/** A candidate start time produced by the availability algorithm. */
export interface TimeSlot {
  /** Instant the session would start. */
  start: Date;
  /** Instant the session would end. */
  end: Date;
  /** Minutes from midnight in the site timezone, for display + sorting. */
  minutesOfDay: MinutesOfDay;
  /** Pre-formatted label in the site timezone, e.g. "6:00 PM". */
  label: string;
  available: boolean;
  /** Why the slot is not bookable. `null` when `available` is true. */
  reason: SlotUnavailableReason | null;
}

export type SlotUnavailableReason =
  | 'booked'
  | 'tooSoon'
  | 'past'
  | 'outsideWindow'
  | 'blocked';

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export interface AdminRecord {
  uid: string;
  email: string;
  displayName: string;
  createdAt?: Timestamp;
}

/** Everything the public site needs, fetched as one bundle. */
export interface SiteContentBundle {
  site: SiteSettings;
  scheduling: SchedulingSettings;
  legal: LegalSettings;
  subjects: Subject[];
  testimonials: Testimonial[];
}
