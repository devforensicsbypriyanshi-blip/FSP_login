# FSP Platform — Product Requirements Document

**Product:** Forensic Science by Priyanshi (FSP) Learning Platform
**Version:** 1.0 · **Date:** 2026-08-05 · **Status:** Approved for build
**Owner:** Priyanshi Verma · **Scale:** ~200 students

---

## 1. Summary

FSP is a Progressive Web App that replaces the WhatsApp-groups-plus-Google-Drive-links workflow currently used to teach UGC NET Forensic Science, with a single installable platform for live classes, recorded lectures, notes, mock tests, doubts and payments.

**The problem today:** content is scattered across WhatsApp and Drive folders; there is no record of who watched what, no way to stop one paid account from being shared across dozens of students, no structured doubt resolution, and no payment or enrolment trail.

**What success looks like in six months:** all ~200 students on the platform, live attendance visible and measurable, account sharing materially reduced, and Priyanshi able to run the entire operation — schedule, content, pricing, features — without a developer.

---

## 2. Scale — the number every decision is sized to

**200 students total.** Not 6,240. The figures in the UI mockups are placeholder demo content.

| Metric | Realistic value | Consequence |
|---|---|---|
| Registered students | ~200 | Supabase free tier (500 MB, 50k MAU) is ample |
| Peak concurrent live attendance | **80–120** (40–60% of roster) | Google Meet Business Standard's 150 cap is sufficient |
| Live classes per week | 3–5 | Recurrence engine, not a scheduling product |
| Emails per month | ~2,000 | **Tight** against Resend free (3,000/mo, **100/day**) — digest batching is required, not optional |
| Peak concurrent app users | ~150 | No read replicas, no partitioning, no CDN tier needed |
| Database size, year 1 | < 100 MB | Well inside free tier |
| Video storage | 0 bytes on our infra | Everything lives in Google Drive |

**Explicitly not building for scale we do not have:** read replicas, table partitioning, Redis, materialised KPI views, multi-region, autoscaling, microservices. `count(*)` over 200 rows is free. Adding these would cost money and weeks and buy nothing.

---

## 3. Users

| Persona | Who | Primary need | Volume |
|---|---|---|---|
| **Student** | UGC NET / MSc Forensic Science aspirant, 20–28, mobile-first, mid-range Android or iPhone, often on patchy 4G | Attend live class, rewatch recordings, download notes, take mock tests, get doubts answered | ~200 |
| **Educator** | Priyanshi Verma (head educator) + up to 7 staff | Schedule and run classes, publish content by pasting a Drive link, answer doubts, see who is falling behind | 1–8 |
| **Admin** | Priyanshi / business owner | Revenue, enrolments, refunds, coupons, who has access to what | 1–2 |
| **Support** | Assistant handling student issues | Resolve login/access/payment tickets fast | 1–2 |
| **Developer** | Technical operator | Toggle features, change platform behaviour, diagnose issues — **without deploying** | 1 |

**Device reality:** roughly two-thirds Android, one-third iPhone; the majority of usage is on a phone. This drives two hard requirements: mobile-first layout throughout, and PWA installation prompted explicitly on iOS (where push notifications do not work at all until the app is added to the home screen).

---

## 4. Goals & non-goals

### Goals
1. One place for every class, note and test — replacing WhatsApp + Drive sprawl.
2. **Stop account sharing** — one active session per account, enforced server-side.
3. **Zero-deploy operations** — every feature flagged and every setting editable from the developer console.
4. Reliable live attendance: a student should never miss a class they intended to join.
5. Payments that self-serve: pay → enrolled → access, with no manual step.
6. Run on free tiers wherever legitimate; one paid hosting plan is acceptable.

### Non-goals (v1)
- Native iOS/Android apps — the PWA covers it
- Our own video hosting or transcoding — Drive is the requirement
- DRM — not achievable at this budget; we deter and trace instead
- Multi-language — English only
- Live proctoring, AI tutoring, marketplace/multi-tenant, affiliate program
- Google Calendar / Google Drive **API** integrations — plain links only

---

## 5. Functional requirements

Priority: **P0** ship-blocking · **P1** important · **P2** if time allows.
Every requirement is behind a feature flag (Part 5 §3.5).

### 5.1 Authentication & accounts

| ID | Requirement | Pri |
|---|---|---|
| AUTH-1 | Register with email + full name + exam target + DPDP consent; verify by 6-digit email OTP | P0 |
| AUTH-2 | Sign in by email OTP. **No password, no Google OAuth, no phone/SMS anywhere** | P0 |
| AUTH-3 | OTP: 6 digits, 10-min expiry, 5 attempts, 60s resend cooldown, rate-limited per email and per IP | P0 |
| AUTH-4 | **One active session per account** — a new login evicts the previous device with an explanatory message | P0 |
| AUTH-5 | Idle auto-logout, **paused during live classes and quiz attempts** | P0 |
| AUTH-6 | Self-serve device list + "sign out other devices"; ≤5 device switches per 24h | P1 |
| AUTH-7 | Five roles with distinct portals; permissions enforced in RLS, API and UI | P0 |
| AUTH-8 | Self-serve data export and account deletion (DPDP) | P1 |

### 5.2 Content & courses

| ID | Requirement | Pri |
|---|---|---|
| CNT-1 | Educator creates a course with modules and ordered lessons | P0 |
| CNT-2 | **Paste any Google Drive URL → validated, file ID stored, banner auto-generated via Cloudinary** | P0 |
| CNT-3 | Student plays video and reads PDFs in-app via the Drive preview iframe | P0 |
| CNT-4 | Progress tracked at **lesson level** (opened / completed) — second-level resume is technically impossible with Drive | P0 |
| CNT-5 | Notes & DPPs from private storage via 60-second signed URLs, every download audited | P0 |
| CNT-6 | Per-student PDF watermarking (name, email, timestamp) | P1 |
| CNT-7 | Free preview lessons visible before purchase | P1 |
| CNT-8 | Admin approval before a course publishes | P2 |

### 5.3 Live classes & calendar

| ID | Requirement | Pri |
|---|---|---|
| LIVE-1 | Educator schedules a class: title, course/batch, date/time, duration, **Google Meet link**, optional Drive material | P0 |
| LIVE-2 | **Recurring schedules auto-generate sessions** on a rolling 60-day horizon, with a preview of the first 10 dates before saving | P0 |
| LIVE-3 | Cancel or reschedule a single occurrence without disturbing the pattern | P1 |
| LIVE-4 | **Our own calendar** — agenda on mobile, month grid on desktop, IST, no Google Calendar | P0 |
| LIVE-5 | **Join link revealed only T-15min → T+30min, and only to active enrolled students.** Server-enforced | P0 |
| LIVE-6 | Reminders at T-24h and T-15m via in-app, push and email | P0 |
| LIVE-7 | Attendance recorded on join | P1 |
| LIVE-8 | **Publish recording:** paste the Drive link Meet produced → session shows "Watch recording", optionally becomes a lesson | P0 |
| LIVE-9 | In-app live chat during class | P2 |

### 5.4 Assessment

| ID | Requirement | Pri |
|---|---|---|
| QUIZ-1 | Educator builds MCQ quizzes with per-question marks and negative marking | P1 |
| QUIZ-2 | Timed runner with question palette, autosave, **server-authoritative timer** | P1 |
| QUIZ-3 | **Server-side scoring; correct answers never sent to the client** | P0 (if quizzes ship) |
| QUIZ-4 | Scorecard with per-topic breakdown | P1 |
| QUIZ-5 | Leaderboard | P2 |

### 5.5 Doubts

| ID | Requirement | Pri |
|---|---|---|
| DBT-1 | Student posts a doubt with subject tag and optional image | P1 |
| DBT-2 | Educator answers; answer marked **Verified Educator** | P1 |
| DBT-3 | Student notified on answer | P1 |
| DBT-4 | Upvotes, search, filter by pending/answered | P2 |

### 5.6 Payments

| ID | Requirement | Pri |
|---|---|---|
| PAY-1 | Razorpay checkout — UPI, cards, netbanking | P0 |
| PAY-2 | **Server-side re-pricing** — client-sent amounts are never trusted | P0 |
| PAY-3 | Coupons with validity window, usage caps and per-user limits | P1 |
| PAY-4 | **Signature-verified, idempotent webhook** → auto-enrolment in one transaction | P0 |
| PAY-5 | Invoice emailed on success | P1 |
| PAY-6 | Admin-initiated refunds, audit-logged | P1 |
| PAY-7 | Physical book orders capture shipping address **and phone** (the only place a phone is collected) | P2 |

### 5.7 Notifications

| ID | Requirement | Pri |
|---|---|---|
| NTF-1 | In-app centre with filters and unread badge, updating in realtime | P0 |
| NTF-2 | Web Push to all registered devices | P0 |
| NTF-3 | Email fallback via Resend, **digest-batched** to respect the 100/day free cap | P0 |
| NTF-4 | Per-type preferences and quiet hours (22:00–07:00 IST) | P1 |
| NTF-5 | iOS install prompt explaining that push requires Add to Home Screen | P0 |

### 5.8 Operations

| ID | Requirement | Pri |
|---|---|---|
| OPS-1 | **Every feature behind a runtime flag, toggleable from the developer console without a deploy** | P0 |
| OPS-2 | **Every tunable setting editable from the console**, typed and validated | P0 |
| OPS-3 | Config change history with who/when/before/after and one-click revert | P0 |
| OPS-4 | Kill switches (payments, auth, maintenance mode) restricted to admin + step-up re-auth | P0 |
| OPS-5 | Immutable audit log of all privileged actions | P1 |
| OPS-6 | Support ticket queue with student context | P1 |
| OPS-7 | Admin KPIs: revenue, enrolments, attendance, completion | P1 |
| OPS-8 | Email delivery lookup for "I didn't get my OTP" tickets | P1 |

---

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | LCP < 2.5s on 4G mid-range Android; initial JS < 180 KB gzip; API p95 < 500 ms |
| **Availability** | 99.5% monthly. Live-class hours (typically 16:00–21:00 IST) are the critical window |
| **Mobile** | Every screen usable at 375 px. Tap targets ≥ 44 px. Tables become card lists below `md` |
| **Offline** | Browse cached courses, read downloaded notes, queue quiz answers. Video and live require network |
| **Accessibility** | WCAG 2.1 AA: keyboard navigation, visible focus, ≥4.5:1 contrast, labelled controls, zero critical axe violations |
| **Security** | RLS on every table; service-role key server-only; signature-verified webhooks; no client-trusted prices, IDs or timers; append-only money and audit tables |
| **Privacy** | India DPDP: explicit consent at signup, self-serve export and deletion, minimal collection (**no phone at signup**), Supabase `ap-south-1` |
| **Data integrity** | Money in integer paise-free INR, never floats. All timestamps `timestamptz` UTC, rendered IST |
| **Browsers** | Last 2 versions of Chrome, Safari, Edge, Firefox; Android 10+; iOS 16.4+ for push |

---

## 7. Success metrics

| Metric | Baseline | 6-month target |
|---|---|---|
| Students onboarded | 0 | 200 (100%) |
| Weekly active students | — | ≥ 70% |
| Live class attendance | unmeasured | ≥ 60% of enrolled, **and measurable for the first time** |
| Recording watched within 48h of a missed class | unmeasured | ≥ 40% |
| Doubt first-response time | hours (WhatsApp) | < 12 h median |
| Payment success rate | manual | ≥ 95% |
| Accounts hitting the device-switch cap | unknown | Tracked — this *is* the sharing signal |
| Support tickets per 100 students / month | unknown | < 10 |
| Lighthouse PWA / a11y | — | ≥ 90 / ≥ 95 |

---

## 8. Cost at 200 students

| Item | Monthly | Note |
|---|---|---|
| **Vercel Pro** | ~$20 (₹1,700) | **Unavoidable** — Hobby prohibits commercial use |
| Supabase | ₹0 | Free tier ample at this size; needs a keep-warm cron and external backups |
| Cloudinary | ₹0 | Free tier ample |
| Resend | ₹0 | Free tier, **only if digest batching is implemented** |
| Google Workspace | already owned | Verify tier covers peak concurrent attendance |
| Domain | ~₹100 | Annual, amortised |
| Sentry / uptime | ₹0 | Free tiers |
| **Total** | **≈ ₹1,800/month** | |

Upgrade triggers, not schedules: Supabase Pro when the DB passes ~400 MB or PITR backups become necessary; Resend paid if a single day ever needs > 100 emails.

---

## 9. Release plan

| Phase | Scope | Duration |
|---|---|---|
| **0 ✅** | Foundations — repo, Next.js, tokens, CI, Drive parser, health | Done |
| **1** | Registration + email OTP, RBAC, **session lock**, **config/flag system**, PWA shell | ~2 weeks |
| **2** | Courses, Drive ingestion, player, notes vault, progress | ~2 weeks |
| **3** | Live classes, recurrence engine, calendar, gated join links, reminders, recording publish | ~1.5 weeks |
| **4** | Razorpay checkout, webhooks, coupons, auto-enrolment, invoices | ~1.5 weeks |
| **5** | Doubts, notifications, announcements, quizzes, mentorship | ~2 weeks |
| **6** | Admin / support / developer consoles, audit logs | ~1.5 weeks |
| **7** | Hardening — rate limits, Sentry, monitoring, pgTAP RLS suite, E2E, a11y, perf | ~1.5 weeks |

**≈ 12 weeks to full v1.** A usable platform exists after Phase 3 (~6 weeks): students can register, learn and attend live classes, with enrolment granted manually until Phase 4 lands.

**Phase 8 (LiveKit) is deferred indefinitely.** At 200 students with Google Meet working, it solves a problem that does not exist. Revisit only if Meet's cap or feature set becomes a genuine constraint.

---

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Meet participant cap below peak attendance | Students locked out of class | **Verify the Workspace tier before Phase 3.** Standard = 150, Plus = 500 |
| Resend 100/day cap hit by a class reminder to 200 students | Reminders silently undelivered | Digest batching from day one; alert at 80% of daily quota; upgrade path is $20/mo |
| Drive per-file daily view quota | A popular lesson fails for everyone | `drive_file_mirrors` fallback + detection + admin alert |
| Drive recordings left org-only after a class | Students hit permission-denied | Studio validates sharing on paste and warns — expected to be the #1 ticket source |
| Device lock frustrates legitimate users | Support load, churn | Self-serve "sign out other devices", trusted-device grace, clear messaging |
| Supabase free tier pauses after 7 days idle | Platform down after a holiday | Keep-warm cron every 6 hours |
| No PITR backups on free tier | Data loss | Nightly external dump; upgrade to Pro before it matters |
| Config console misuse takes platform down | Outage | Kill switches admin-only + step-up; validation; history with one-click revert |
| Scope growth beyond 200-student sizing | Wasted cost and time | This PRD's §2 is the reference for every capacity argument |

---

## 11. Open items

| # | Item | Status |
|---|---|---|
| 1 | **Domain** | ✅ **`forensicbypriyanshi.com`** (confirmed 2026-08-06). Needed for Resend DKIM/SPF |
| 2 | **Pricing & access duration** | ✅ **Per course, set after launch, admin-editable.** Lives on `courses.price_inr` and `courses.access_days`; `courses.default_*` settings only pre-fill the create form |
| 3 | **Refund policy** | ✅ **No refunds — all sales are final** (confirmed 2026-08-06). `payments.self_serve_refund` is off and `refund_window_days` is 0. Admin refunds stay available for duplicate charges and failed access; every one requires a written reason, enforced by a DB constraint |
| 4 | **Support hours** | ✅ **11:00–19:00 IST.** Stored in `support.hours_start` / `hours_end`; `support_is_open()` drives the UI badge and SLA timers. **Working days assumed Mon–Sat** — confirm whether Sunday is staffed |
| 5 | **Google Workspace tier** | ⏳ Still open — confirm the Meet participant cap against real peak attendance (Admin console → Billing) |
| 6 | **Supabase service-role key** | ⏳ Owner to paste into `.env.local`; never shared over chat |
| 7 | **Published refund policy page** | ⏳ **Razorpay requires it.** Merchant accounts must link a public Refund/Cancellation Policy. A no-refund stance is permitted but must be stated publicly — a `/refund-policy` page rendering `payments.refund_policy_text` is needed before go-live |
| 8 | **Support working days** | ⏳ Hours confirmed (11:00–19:00 IST) but days assumed **Mon–Sat**. Confirm whether Sunday is staffed |

**Design consequence of items 2–4:** none of these are constants in application code. Prices and durations live on the course row; refund and support policy live in `app_settings`. The client changes all of it from the admin console without a deployment — which is why the settings engine was built before the features that use it.

---

## 12. Reference documents

| Part | Document |
|---|---|
| 0 | [Overview, Decisions & Roadmap](00-OVERVIEW-DECISIONS-ROADMAP.md) |
| 1 | [System Architecture](01-SYSTEM-ARCHITECTURE.md) |
| 2 | [Database Schema](02-DATABASE-SCHEMA.md) |
| 3 | [Security, Ops, CI/CD & Scaling](03-SECURITY-OPS-CICD-SCALING.md) |
| 4 | [Sessions, OTP, Calendar & Notifications](04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md) |
| 5 | [Registration & Platform Config](05-REGISTRATION-AND-PLATFORM-CONFIG.md) |
| 6 | **PRD** ← this document |
