/**
 * Default site content.
 *
 * This is the *seed*, not the source of truth. Every value here is written into Firestore
 * on first run and edited from the admin dashboard afterwards; nothing in the UI reads
 * from this file at runtime except as a fallback when Firestore has not been seeded yet.
 *
 * Content rule: the qualifications below are exactly the ones the site owner supplied.
 * Do not add credentials here — no "certified", "licensed", or "professional" claims.
 * If the owner earns something new, they add it in Admin -> Website Content.
 */

import type {
  LegalSettings,
  SchedulingSettings,
  SiteSettings,
  Subject,
  Weekday,
  WeeklyAvailability,
} from '@/types';

export const DEFAULT_SITE: SiteSettings = {
  businessName: 'John Williams Math Tutoring',
  tutorName: 'John Williams',
  tagline: 'High School AP Calculus Student & Competitive Mathematician',

  hero: {
    eyebrow: 'Middle school through Algebra 2',
    heading: 'Math Made Clear. Confidence Built.',
    subheading:
      'One-on-one tutoring from a competitive mathematician who still remembers what it feels like to be stuck.',
    intro:
      'I work with middle school and high school students on the math they are learning right now — untangling the confusing parts, then building the kind of understanding that holds up on the next test and the one after that.',
    primaryCtaLabel: 'Schedule a Session',
    secondaryCtaLabel: 'Learn More',
  },

  about: {
    heading: 'About Me',
    bio: [
      "I'm John Williams, a high school AP Calculus student and competitive mathematician. I have spent eight years in competitive mathematics, and most of what I know about explaining math I learned from having to figure it out myself first.",
      'That is the part I think matters. I am close enough to these courses to remember exactly where they get confusing — which step in factoring feels arbitrary, why the unit circle looks like memorization until suddenly it does not. I have been the student staring at a problem with no idea where to start, and I know what actually helps in that moment.',
      'Sessions are one-on-one and built around whatever the student is working on: this week\'s homework, an upcoming test, or the gap from two chapters ago that is quietly making everything since then harder.',
    ].join('\n\n'),
    qualifications: [
      'AP Calculus student',
      'Competitive mathematician',
      'Top 100 Calculus Student in Florida',
      'First-place grade-wide mathematics competition winner',
      '8 years of competitive mathematics experience',
    ],
    teachingPhilosophyHeading: 'How I Teach',
    teachingPhilosophy: [
      'I do not give answers. I ask the question that gets the student to the next step themselves, because the goal is that they can do it when I am not there.',
      'Most math struggles are not really about the current chapter. They trace back to something earlier that never quite clicked. So when something is not landing, we go back and fix the foundation instead of piling more on top of it.',
      'And I keep it honest: if a student gets something wrong, I say so, and then we work out why. Confidence built on vague encouragement does not survive a test.',
    ].join('\n\n'),
    photoUrl: '',
    photoStoragePath: '',
    photoAlt: 'Portrait of John Williams',
  },

  why: {
    heading: 'Why Tutor With Me',
    subheading: 'What an hour actually gets you.',
    points: [
      {
        id: 'personalized',
        title: 'Built Around One Student',
        body: 'No fixed curriculum. We work on what your student is actually stuck on this week, at the pace they actually need.',
        icon: 'target',
      },
      {
        id: 'competition',
        title: 'Competition Experience',
        body: 'Eight years of competitive mathematics means I have seen a lot of ways to approach a problem — including the ones that are faster than the textbook method.',
        icon: 'trophy',
      },
      {
        id: 'clarity',
        title: 'Explanations That Land',
        body: 'If an explanation is not working, I find another one. Understanding a concept three ways beats memorizing it once.',
        icon: 'lightbulb',
      },
      {
        id: 'flexible',
        title: 'Flexible Scheduling',
        body: 'Evenings and weekends, booked online in about a minute. Reschedule when life happens.',
        icon: 'calendar',
      },
      {
        id: 'foundations',
        title: 'Fixes the Real Gap',
        body: 'When the problem started two chapters ago, we go back and repair it rather than working around it.',
        icon: 'layers',
      },
    ],
  },

  pricing: {
    heading: 'Simple, Honest Pricing',
    subheading: 'One rate. No packages, no contracts, no minimum commitment.',
    note: 'Payment is arranged directly — no payment is collected through this website. Cancellations and reschedules follow the cancellation policy linked below.',
    currencySymbol: '$',
    tiers: [
      {
        id: 'standard-60',
        label: 'Standard Session',
        durationMinutes: 60,
        price: 30,
        description:
          'A full hour, one-on-one. Enough time to work through homework, cover a concept properly, and check that it stuck.',
        featured: true,
        visible: true,
      },
    ],
  },

  contact: {
    heading: 'Get In Touch',
    subheading: 'Questions before booking? Text me — I usually reply the same day.',
    phone: '786-452-6881',
    email: '',
    phoneCtaLabel: 'Text 786-452-6881',
    location: 'Flexible Scheduling',
    socials: [],
  },

  scheduleCta: {
    heading: 'Ready to improve your math?',
    subheading:
      'Pick a time that works, tell me a little about your student, and we will get started.',
    buttonLabel: 'Schedule a Session',
  },

  testimonialsHeading: 'What Families Say',
  testimonialsSubheading: '',

  subjectsHeading: 'What I Tutor',
  subjectsSubheading: 'Middle school math through Algebra 2.',

  seo: {
    title: 'John Williams Math Tutoring | Algebra, Geometry & More',
    description:
      'One-on-one math tutoring for middle school and high school students — Algebra 1, Geometry, Algebra 2 and all middle school math. $30/hour with flexible evening and weekend scheduling.',
    canonicalUrl: '',
    ogImageUrl: '',
  },

  footer: {
    tagline: 'One-on-one math tutoring for middle school and high school students.',
    copyright: '© {year} John Williams Math Tutoring. All rights reserved.',
  },

  theme: {
    primary: '#662720',
    cream: '#F6DF91',
    coral: '#B4472F',
    light: '#F4F1EA',
    dark: '#2B1B18',
  },
};

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

const WEEKNIGHT = { enabled: true, periods: [{ start: 18 * 60, end: 20 * 60 }] };
const WEEKEND = { enabled: true, periods: [{ start: 10 * 60, end: 18 * 60 }] };

export const DEFAULT_WEEKLY_AVAILABILITY: WeeklyAvailability = {
  0: { ...WEEKEND, periods: [...WEEKEND.periods] },
  1: { ...WEEKNIGHT, periods: [...WEEKNIGHT.periods] },
  2: { ...WEEKNIGHT, periods: [...WEEKNIGHT.periods] },
  3: { ...WEEKNIGHT, periods: [...WEEKNIGHT.periods] },
  4: { ...WEEKNIGHT, periods: [...WEEKNIGHT.periods] },
  5: { ...WEEKNIGHT, periods: [...WEEKNIGHT.periods] },
  6: { ...WEEKEND, periods: [...WEEKEND.periods] },
} as Record<Weekday, { enabled: boolean; periods: { start: number; end: number }[] }>;

export const DEFAULT_SCHEDULING: SchedulingSettings = {
  timezone: 'America/New_York',
  defaultDurationMinutes: 60,
  sessionDurations: [60],
  bufferMinutes: 15,
  minimumNoticeMinutes: 720, // 12 hours
  maximumAdvanceDays: 60,
  weekendsEnabled: true,
  allowSameDayBookings: false,
  requireParentEmail: false,
  studentNotesEnabled: true,
  bookingIntro:
    'Pick a date and time below. Sessions are one-on-one, and a parent or guardian should be the one booking.',
  privacyNotice:
    "The student's first name is used only so I know who I am working with. It is never published on this website or shared with anyone.",
  weekly: DEFAULT_WEEKLY_AVAILABILITY,
};

/* ------------------------------------------------------------------ */
/* Subjects                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_SUBJECTS: Omit<Subject, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'middle-school-math',
    name: 'Middle School Math',
    description:
      'Fractions, ratios, negative numbers, and the pre-algebra that everything after it is built on. This is where most later gaps start.',
    icon: 'divide',
    gradeRange: 'Grades 6-8',
    priceLabel: '',
    order: 0,
    visible: true,
  },
  {
    id: 'algebra-1',
    name: 'Algebra 1',
    description:
      'Linear equations, systems, factoring, and quadratics — plus why any of it is a thing, which the textbook rarely explains.',
    icon: 'variable',
    gradeRange: 'Grades 8-9',
    priceLabel: '',
    order: 1,
    visible: true,
  },
  {
    id: 'geometry',
    name: 'Geometry',
    description:
      'Proofs, triangles, circles, area and volume. The course where students who were fine at algebra suddenly need a different way of thinking.',
    icon: 'triangle',
    gradeRange: 'Grades 9-10',
    priceLabel: '',
    order: 2,
    visible: true,
  },
  {
    id: 'algebra-2',
    name: 'Algebra 2',
    description:
      'Functions, logarithms, complex numbers, and conics. The bridge to precalculus, and the point where earlier gaps stop being survivable.',
    icon: 'function',
    gradeRange: 'Grades 10-11',
    priceLabel: '',
    order: 3,
    visible: true,
  },
];

/* ------------------------------------------------------------------ */
/* Legal                                                               */
/* ------------------------------------------------------------------ */

const LAST_UPDATED = 'August 2026';

export const DEFAULT_LEGAL: LegalSettings = {
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: LAST_UPDATED,
    body: `This policy explains what information this website collects, why it is collected, and what is done with it. It applies to john-williams-math-tutoring and to the tutoring services booked through it.

## Who runs this site

This website is operated by an individual tutor, not a company. Where this policy says "I" or "me", it means the tutor named on the site.

## What is collected

When you book a session, the booking form collects:

- Parent or guardian name
- Student name
- Phone number
- Email address (optional)
- Subject you would like covered (optional)
- Notes you choose to write (optional)
- The date, time, and length of the session you selected
- The time at which you accepted the policies

Nothing else is collected through the booking form. There is no account to create, no password to store, and no payment information taken on this site.

## What is deliberately not collected

Do not send, and do not enter into the notes field:

- Medical or health information
- Social Security numbers or government ID numbers
- Bank account, card, or other financial account details
- School login credentials
- Any other sensitive personal information

None of it is needed to schedule a tutoring session, and it should not be submitted here.

## Why it is collected

The information is used only to:

- Confirm and prepare for the session you booked
- Contact you about that session, including if it needs to be rescheduled
- Keep a simple record of past and upcoming sessions

It is not used for advertising. It is not sold. It is not shared with anyone for marketing purposes.

## Analytics and tracking

This website does not use advertising cookies or third-party tracking or analytics scripts. It does not build an advertising profile of you.

## How it is stored

Booking information is stored in Google Firebase (Cloud Firestore), a hosted database service operated by Google. The site itself is served by GitHub Pages. Both providers process data on my behalf as infrastructure providers, subject to their own terms and security practices. Access to the stored bookings requires a password-protected administrator account.

Because these are third-party services, information you submit is stored on their servers, which may be located outside your state or country.

## Information about students

A student's name is collected only so that I know who I am working with. Student names are never published on this website, never used in testimonials, and never shared with third parties beyond the infrastructure providers described above.

If you would prefer, you may enter a first name or a nickname rather than a full name. It will not affect the booking.

## How long it is kept

Booking records are kept while they are useful for scheduling and for keeping track of past sessions, and are deleted when they are no longer needed. You may ask for your records to be deleted sooner — see below.

## Security

Access to booking data is restricted to authenticated administrator accounts through database security rules. Data is transmitted over encrypted HTTPS connections. No system is perfectly secure, and no guarantee of absolute security can honestly be made, but the information collected here is deliberately kept minimal to limit what is at risk.

## Your choices

You may ask me to:

- Tell you what booking information is held about you
- Correct anything that is wrong
- Delete your booking records

To make any of these requests, contact me using the phone number or email on the Contact section of the site. Please allow a reasonable amount of time for a response.

Depending on where you live, you may have additional rights under local privacy law. Making a request costs nothing, and you will not be treated differently for making one.

## Children

Tutoring often involves students under 18. Bookings are intended to be made by a parent or guardian, not by a child independently. See the Parent & Guardian Notice for more.

If you believe a child has submitted information here without a parent's involvement, contact me and I will delete it.

## Changes

This policy may be updated. The "last updated" date above reflects the most recent change.

## Contact

Use the phone number or email listed in the Contact section of this website for any question about this policy.`,
  },

  terms: {
    title: 'Terms of Service',
    lastUpdated: LAST_UPDATED,
    body: `These terms cover the use of this website and the tutoring services booked through it. By booking a session, you agree to them.

## The service

This site offers one-on-one math tutoring provided by an individual tutor. Tutoring is academic support. It is not a school, not an accredited educational institution, and not a substitute for a student's enrolled coursework or their teacher.

## Who may book

Sessions for students under 18 must be arranged by a parent or legal guardian. By submitting a booking, you confirm that you are the parent or guardian of the student named, or that you are 18 or older and booking for yourself.

## Accuracy of what you submit

Please give accurate contact details. Sessions are confirmed and changed using the phone number you provide, so a wrong number generally means a missed session. You are responsible for the accuracy of what you enter.

## Scheduling

Booking a time on this site reserves that time. Times shown are in the timezone stated on the scheduling page.

A booking is confirmed when the confirmation screen appears with a confirmation code. If you do not reach that screen, the session was not booked.

## Cancellations and rescheduling

Cancellations and reschedules are covered by the Cancellation & Rescheduling Policy, which forms part of these terms.

## Conduct during sessions

Sessions are expected to be a reasonable working environment. Tutoring may be ended, and future bookings declined, in cases of abusive behaviour, or where a student is repeatedly unwilling to participate. This is expected to be rare.

## What tutoring does and does not promise

Tutoring is support and practice. No particular grade, test score, or academic outcome is promised or guaranteed, because results depend on many things outside any tutor's control — including how much work the student does between sessions.

Nothing here is a promise of admission to any school or program.

## Academic honesty

Tutoring helps a student understand and complete their own work. Completing graded assignments, take-home tests, or exams *on a student's behalf* is not offered, and requests to do so will be declined.

## Payment

Payment is arranged directly between you and the tutor. No payment is processed through this website, and no card details are collected here. Rates shown on the site are current at the time of display and may change; the rate that applies is the one in effect when the session is booked.

## Website availability

This website is provided as-is. It depends on third-party services (GitHub Pages, Google Firebase) and may be unavailable, interrupted, or contain errors. Reasonable effort is made to keep the scheduling system accurate, but no guarantee of uninterrupted availability is made.

If the scheduling system is not working, contact by phone.

## Limitation of liability

To the fullest extent permitted by law, the tutor is not liable for indirect, incidental, or consequential damages arising from the use of this website or the tutoring services, including missed sessions, scheduling errors, or academic outcomes. Nothing in these terms limits liability where the law does not allow it to be limited.

## Intellectual property

The content, design, and text of this website belong to the site owner. Worksheets, notes, and materials prepared for a session are for that student's personal educational use, and should not be redistributed or sold.

## Changes to these terms

These terms may be updated. Continuing to use the site or book sessions after a change means accepting the updated version. The "last updated" date above reflects the most recent change.

## Contact

Questions about these terms can be directed to the phone number or email in the Contact section.`,
  },

  cancellation: {
    title: 'Cancellation & Rescheduling Policy',
    lastUpdated: LAST_UPDATED,
    body: `Plans change. This policy is meant to be fair to both sides, not to catch anyone out.

## Cancelling or rescheduling a session

Please give at least 24 hours' notice if you need to cancel or move a session. Text the number listed in the Contact section, and include the student's name and the session time.

With 24 hours' notice or more, there is no charge and the time can be rebooked at no cost.

## Short-notice changes

Cancellations with less than 24 hours' notice are understood — illness, transport, and school events are not planned. Please just let me know as early as you can so the time can be offered to someone else.

Repeated last-minute cancellations may mean I ask to confirm future sessions in advance.

## No-shows

If a student does not attend and no message is received, the session is recorded as a no-show. If it happens more than once, I will get in touch before booking further sessions.

## Lateness

If a student is late, the session still ends at its scheduled time, since another session may follow. If I am running late, the missed time is made up — either in that session or added to the next one.

## If I need to cancel

If I have to cancel, you will be contacted as early as possible and the session will be rescheduled at a time that works for you, at no cost.

## Bad weather and emergencies

If a session cannot safely go ahead, it will be rescheduled at no cost.

---

*This policy is fully editable from the site's admin dashboard. Update it to match how you actually want to run your tutoring.*`,
  },

  guardian: {
    title: 'Parent & Guardian Notice',
    lastUpdated: LAST_UPDATED,
    body: `Please read this before booking a session for a student under 18.

## Bookings should be made by a parent or guardian

Tutoring sessions for students under 18 are intended to be arranged and authorised by a parent or legal guardian. The booking form asks for a parent or guardian name for exactly this reason.

Students should not book sessions independently without a parent's knowledge.

## What this service is

This is academic tutoring — help with math coursework and concepts. It is not childcare, not supervision, and not a substitute for parental oversight. The tutor is responsible for the tutoring session itself, not for a student's general welfare, transport, or supervision before or after it.

## Parent and guardian responsibility

By booking, the parent or guardian is responsible for:

- Arranging and authorising the session
- Making sure the student can attend safely, including getting to and from the session
- Providing accurate contact information so they can be reached
- Deciding what personal information is appropriate to share on the booking form

## Staying informed

Parents and guardians are welcome to be present during sessions, to ask what was covered, and to be updated on progress at any point. Just ask.

## Information about your student

The booking form asks for the student's name so the tutor knows who they are working with. A first name or nickname is fine if you prefer. Student names are never published on this site or shared for any other purpose — see the Privacy Policy.

## Questions or concerns

Any concern about a session, about what was covered, or about how information is handled can be raised at the phone number or email in the Contact section, and it will be addressed directly.`,
  },

  accessibility: {
    title: 'Accessibility Statement',
    lastUpdated: LAST_UPDATED,
    body: `This site is meant to be usable by everyone, including people using screen readers, keyboard navigation, or assistive technology.

## What has been done

The site has been built with accessibility in mind:

- Semantic HTML with a logical heading structure
- Every interactive element reachable and operable by keyboard
- Visible focus indicators on links, buttons, and form fields
- Form fields with real labels, and errors announced to assistive technology
- Colour contrast checked against WCAG 2.1 AA targets for text
- Availability shown with text and icons, not colour alone
- Alternative text on meaningful images; decorative graphics hidden from screen readers
- Animation and parallax reduced automatically when your system requests reduced motion
- Layout that reflows to narrow screens and zoom without horizontal scrolling

## What this statement does not claim

This site aims to follow WCAG 2.1 Level AA. It has not been independently audited, so it would be dishonest to state formal certification or full conformance. There may be issues that have not been found yet.

## Reduced motion

If your device is set to reduce motion, background parallax and scroll animations are switched off automatically. You do not need to change anything on this site.

## Found a problem?

If any part of this site is difficult to use with your assistive technology, please say so — contact details are in the Contact section. Describe what you were trying to do and what got in the way, and it will be fixed.

If the website itself is a barrier to booking, call or text instead. A session can always be booked directly by phone.`,
  },
};
