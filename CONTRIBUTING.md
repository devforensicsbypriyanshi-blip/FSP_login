# Contributing to FSP — Complete Developer Handbook

Everything needed to work on this platform, in one file: access, setup, architecture, the **full security model**, data model, product context, conventions and workflow.

The `docs/` folder holds the long-form design documents. This file is the distilled version — read it end to end once (~25 minutes), then dip into `docs/` when you need depth on a specific subsystem.

---

## Contents

1. [Getting access](#1-getting-access)
2. [Local setup](#2-local-setup)
3. [What we're building, and at what scale](#3-what-were-building-and-at-what-scale)
   · [3.1 Decision log — why things are the way they are](#31-decision-log--why-things-are-the-way-they-are)
4. [Architecture](#4-architecture)
5. [**Security — the full model**](#5-security--the-full-model)
6. [Data model & RLS](#6-data-model--rls)
7. [Auth, sessions and registration](#7-auth-sessions-and-registration)
8. [Feature flags & runtime config](#8-feature-flags--runtime-config)
9. [Content, live classes and the calendar](#9-content-live-classes-and-the-calendar)
10. [Brand & UI conventions](#10-brand--ui-conventions)
11. [Testing](#11-testing)
12. [CI/CD & workflow](#12-cicd--workflow)
13. [Operations & monitoring](#13-operations--monitoring)
14. [Current state and what's next](#14-current-state-and-whats-next)
15. [Deep-dive documents](#15-deep-dive-documents)

---

## 1. Getting access

**Repository** — the owner adds you on GitHub:
`Settings → Collaborators and teams → Add people` → username → role **Write**.

```bash
git clone https://github.com/VeerBhanushali/FSP_WEBAPP.git
cd FSP_WEBAPP
```

**Secrets never travel over chat, email or Slack.** `.env.example` lists every variable. The owner shares real values through a password manager (1Password / Bitwarden shared vault) or an encrypted note with an expiry.

| Credential | Sensitivity | Who needs it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Low — public by design, gated by RLS | Everyone |
| `SUPABASE_SERVICE_ROLE_KEY` | **Critical — bypasses every security control** | Only webhook/cron work |
| `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Critical | Payments work only |
| `RESEND_API_KEY` | High | Email work only |
| `CLOUDINARY_API_SECRET` | High | Upload work only |
| `SESSION_COOKIE_SECRET`, `CRON_SECRET`, `VAPID_PRIVATE_KEY` | High | Rarely |

**UI-only work needs no real credentials** — placeholders build and run fine.

If a secret is ever exposed (pasted in a PR, committed, sent over chat): tell the owner immediately, rotate it in the provider dashboard, and do **not** try to hide it by force-pushing. Rotation is cheap; a live leaked key is not.

---

## 2. Local setup

```bash
npm install
cp .env.example .env.local     # fill in what the owner sent
npm run dev                    # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | typecheck + lint + tests — **before every push** |
| `npm run build` | Production build (Vercel runs this) |
| `npm run build:local` | Production build into `.next-build` |
| `npm run test` / `test:watch` | Vitest |
| `npm run db:push` | Apply Supabase migrations |
| `npm run db:diff -- <name>` | Author a migration |
| `npm run db:types` | Regenerate `src/types/database.ts` |

> ⚠️ **Never run `npm run build` while `npm run dev` is running.** They share `.next/`; the build overwrites the dev server's chunks and the browser starts 404-ing on CSS, so the page renders as unstyled links. Use `npm run build:local`. This already cost one debugging cycle.

**Demo mode:** with `NEXT_PUBLIC_SHOW_HUB` unset, `/` shows a portal launcher and route guards are relaxed so dashboards are reviewable before auth is wired. Set `NEXT_PUBLIC_SHOW_HUB=false` to get production behaviour (login is the first page, guards enforced). **RLS is unaffected either way** — that flag only controls navigation, never data access.

---

## 3. What we're building, and at what scale

A PWA replacing a WhatsApp-and-Drive-links workflow for teaching UGC NET Forensic Science. Five role-scoped portals: student, educator, admin, support, developer.

### The number that governs every decision: ~200 students

Not thousands. Figures in old mockups ("6,240 students", "284 attending") were placeholder demo content.

| Metric | Real value |
|---|---|
| Registered students | ~200 |
| Peak concurrent live attendance | 80–120 (40–60% attend live) |
| Emails/month | ~2,000 — **but the cap is 100/day** |
| Year-1 database size | < 100 MB |

**Deliberately not built:** read replicas, table partitioning, Redis, materialised KPI views, CDN tiers, multi-region, LiveKit. At 200 rows `count(*)` is free. **Please don't add scaling infrastructure we don't need** — it costs money and time and buys nothing.

**What scale does NOT excuse:** RLS, webhook signature verification, server-side pricing and scoring, the session lock, audit logs. A 200-student platform leaking one student's data to another is exactly as broken as a 200,000-student one.

**Cost:** ≈ ₹1,800/month, essentially all Vercel Pro. Vercel's Hobby plan forbids commercial use, and this platform sells courses — that's the one unavoidable paid item. Everything else fits free tiers.

**Launch scope is three modules:** Courses, Live Classes, Calendar. Notes, quizzes, doubts, store, mentorship, payments and analytics are built but flagged **off**, switched on one at a time.

---

### 3.1 Decision log — why things are the way they are

Standing decisions made with the client. **Please don't reverse these without asking** — each cost a conversation to reach, and several look arbitrary until you know the reason.

| Decision | Reason it exists | What breaks if you undo it |
|---|---|---|
| Scale to ~200 students | Real customer base; mockup numbers were placeholder | Wasted money and weeks on infrastructure with no users |
| **Email OTP only** — no Google OAuth, no phone/SMS, no password | Removes OAuth consent screen, Google app verification, SMS cost, TRAI DLT paperwork; one path to secure | Reintroduces weeks of compliance work and a second attack surface |
| **One active session per account** | The core anti-account-sharing control — one paid login otherwise serves a WhatsApp group | The business model |
| Idle logout **paused** during classes and quizzes | A student watching a 45-min lecture emits no pointer events | Students ejected mid-class — the worst possible bug |
| Live classes on **Google Meet**, video via **Drive links** | Client owns Workspace with recording; Meet recordings land in Drive, which is already our pipeline | Adds hosting cost and a migration for no gain |
| Progress is **lesson-level**, not second-level | The Drive iframe is cross-origin and emits no playback events. It is not a missing feature — it is impossible | UI that promises resume-where-you-left-off and can't deliver |
| **Our own calendar**, not Google Calendar | Removes an OAuth scope request, a Google app-verification review, and a third-party outage from the critical path | Re-adds all three |
| **Every feature behind a flag** | Client must change platform behaviour without a deploy | The reason the flag engine was built before the features |
| v1 launches with **3 modules** (courses, live, calendar) | Ship something real; enable the rest one at a time | Scope creep into a launch that never happens |
| Brand is **navy/amber/peach/rose** | Taken from the live site; the old `style.css` purple was off-brand | The exact complaint the client already raised once |
| Payments **enabled: false** at launch | Razorpay is ready but unproven end-to-end | Money moving before the path is verified |

**Two things that are true and worth internalising:**

1. **No web platform can block screenshots or screen recording.** The brief asked for it; it does not exist. We deter and trace (§5.6). Don't promise otherwise to the client.
2. **Resend's free tier is 100 emails/day**, and one class reminder to 200 students is 200 emails in a minute. Digest batching is a requirement, not an optimisation.

---

## 4. Architecture

One Next.js 15 app (App Router, TypeScript, Tailwind v4) serving all five portals.

```
Phone / tablet / desktop  →  Next.js PWA
                                │
        ┌───────────────────────┴───────────────────────┐
        │ (A) direct, RLS-enforced      (B) privileged   │
        ▼                                               ▼
   Supabase                                Next.js Route Handlers
   ├ Postgres + RLS   ◄──── service role ──┤ /api/*  + Server Actions
   ├ Auth (email OTP)                      └ middleware (edge)
   ├ Storage (private)                              │
   ├ Realtime                        ┌──────────────┼──────────────┐
   └ pg_cron + pg_net                ▼              ▼              ▼
                                Cloudinary      Razorpay        Resend
                                (images)        (payments)      (email)
                                     Google Drive (video/PDF) · Google Meet (live)
```

**Two data paths, deliberately:**

- **(A) Browser → Supabase directly** for reads the user is allowed to make. RLS is the authority. No API layer to write, no cold starts, Realtime for free.
- **(B) Browser → Route Handler → Supabase (service role)** for anything the client could lie about: payments, webhooks, join-link issuance, quiz scoring, email sends, admin mutations.

**The rule: if the browser could lie about it, it goes through (B).**

### Layout

```
src/
  app/            (student)/app · (educator)/studio · (admin)/admin
                  (support)/support · (dev)/dev · (auth) · api/
  components/
    ui/           Button, Card, Badge, Field, DataTable, Avatar, Progress…
    layout/       app shell, sidebar, bottom nav, nav config
    auth/         OTP input, sign-in + register flows
    live/         session management
    mentorship/   booking flow
    player/       protected document viewer
    pwa/          service worker registration + install prompt
  lib/            supabase clients, drive parser, env contract, flags, utils
  types/          generated database types
supabase/
  migrations/     the ONLY way schema changes
  tests/          pgTAP — RLS assertions
docs/             long-form design documents
```

---

## 5. Security — the full model

Read this section even if you're only writing UI.

### 5.1 Threat model — what we actually defend against

| Threat | Realistic? | Primary control |
|---|---|---|
| Student reads another student's data | **High** — the main risk | RLS on every table, proven by pgTAP |
| Paid content accessed without paying | **High** | No student INSERT policy on `enrollments`; enrolment written only by the verified webhook |
| Account sharing across many students | **High** — the core business risk | Single-active-session device lock + switch-rate flagging |
| Live class link leaked to non-payers | **High** | Column-level revoke + time-gated `SECURITY DEFINER` accessor |
| Forged or replayed payment webhook | Medium | HMAC signature verification + idempotency on provider event id |
| Price tampering at checkout | Medium | Server re-prices from the database; client amounts ignored |
| Quiz answer-key extraction | Medium | `is_correct` never leaves the server; scoring server-side |
| Study material redistribution | Medium | No download path, signed URLs, per-student watermark |
| Service-role key leaking to the browser | Low but catastrophic | `server-only` import + CI grep |
| Credential stuffing / OTP brute force | Medium | Rate limits, attempt caps, captcha escalation |

### 5.2 Defence in depth — the layers

```
1. Network / edge      security headers, CSP, HSTS, rate limiting (middleware)
2. Authentication      email OTP only; no password exists to steal
3. Session             single active device, idle timeout, server-side revocation check
4. Authorisation       RBAC checked in RLS + API handler + UI (three places)
5. Data                Row Level Security — the real boundary
6. Application         Zod validation, server-side pricing/scoring/timers
7. Audit               append-only logs, immutable by every role
```

**If any single layer is the only thing protecting something, that's a bug.** RLS is the one that must never be bypassed.

### 5.3 Row Level Security — the actual boundary

Every table has RLS enabled and at least one policy. CI fails the build otherwise (it detects all 49 tables and verifies each).

Two policies carry most of the weight:

**No student INSERT on `enrollments`.** Without it a student could insert their own enrolment row and unlock every paid course for free. Enrolments are written only by the payment webhook using the service role.

```sql
create policy "enrollments: staff only writes" on public.enrollments
  for insert with check (public.is_staff());
```

**Column-level revoke on `live_sessions.join_url`.** RLS is row-level, not column-level, so hiding one column needs a `REVOKE` plus a `SECURITY DEFINER` accessor that enforces enrolment *and* the time window:

```sql
revoke select (join_url) on public.live_sessions from authenticated, anon;
-- served only by get_live_join_url(), which checks:
--   1. active enrolment in the course
--   2. now() is within T-15m .. T+30m
--   3. records attendance as a side effect
```

**Helper functions** (`has_role`, `is_staff`, `is_enrolled`) are `SECURITY DEFINER` with a pinned `search_path`. Without the pin, a caller could shadow `public` and escalate privileges. They're `stable`, so the planner caches them per statement and the extra lookup is effectively free.

**Roles live in `user_roles`, not the JWT.** Putting roles in JWT claims means a revoked admin keeps their powers until the token expires — up to an hour.

### 5.4 The service-role key

It bypasses RLS **entirely**. Rules:

1. Only in `src/lib/env.ts` and `src/lib/supabase/admin.ts`. CI greps for violations and fails the build.
2. `admin.ts` imports `server-only`, making a Client Component import a build error rather than a production incident.
3. Every call site does its **own** authorisation check first — the database will no longer do it for you.
4. Legitimate uses: payment webhooks, join-link issuance, admin actions after an explicit permission check, cron handlers.
5. If RLS is blocking you, **the policy is wrong — fix the policy.** Don't reach for the service role to make a query work.

### 5.5 Payments

```
1. verify HMAC-SHA256 on the RAW body, timing-safe, BEFORE parsing JSON
2. INSERT webhook_events(provider, event_id) ON CONFLICT DO NOTHING   ← idempotency gate
3. if 0 rows inserted → already processed → return 200, stop
4. BEGIN … update order, insert payment, insert enrolment,
   increment coupon, write audit … COMMIT                            ← one transaction
5. queue the invoice email OUTSIDE the transaction
```

- **Re-price server-side.** Client-sent amounts are ignored entirely.
- **Money tables are append-only.** Corrections are new rows, never `UPDATE`.
- Always return 200 for an event already seen, or the provider will retry forever.

### 5.6 Content protection — and its honest limits

The brief asked for "no downloads, screenshots or screen recording". Here's what's true:

**What we do:** no download button, no direct file URL, files in a private bucket behind 60-second signed URLs, per-student watermark (name + email) tiled over every document, copy/right-click/print blocked, content blurred when the tab loses focus.

**What no web platform can do: block OS-level screenshots or screen recording.** No browser API exists. Anyone claiming otherwise is mistaken. Our model is **deter and trace**, not prevent — a leaked capture is traceable to one account.

Similarly, Google Drive video has **no DRM**. Setting sharing to "Viewer, download disabled" removes the obvious button; it doesn't stop a determined user.

### 5.7 Rate limiting

At 200 students, Postgres counters are the implementation — an indexed round-trip costs nothing at ~150 peak concurrency and removes a vendor. Upstash Redis is the documented upgrade.

| Bucket | Limit | Key |
|---|---|---|
| OTP send | 5 / 15 min | IP + email |
| OTP verify | 10 / 15 min | IP |
| Checkout create | 10 / min | user |
| Live join | 30 / min | user |
| Quiz submit | 5 / min | user |
| Global API default | 100 / min | user, else IP |
| **Webhooks** | **unlimited** | signature-gated; never throttle your payment provider |

### 5.8 Headers & CSP

Set in `next.config.ts`. `frame-src` allows Google Drive (lesson player) and Razorpay (checkout); `camera`/`microphone` stay `self` in case an in-app classroom lands later. HSTS with preload, `nosniff`, `frame-ancestors 'none'`, no `object-src`.

### 5.9 Input handling

- **Validate with Zod at every boundary.** `safeParse` → rate limit → authz → act → log.
- **XSS:** store raw, render sanitised. Never `dangerouslySetInnerHTML` on user text.
- **SQL injection:** parameterised via supabase-js/PostgREST. No string-built SQL.
- **Never trust:** client prices, client `user_id` (use `auth.uid()`), client timers (use the server clock).

### 5.10 Privacy — India DPDP Act

Explicit consent at signup with a timestamp · minimal collection (**no phone number at signup**) · self-serve data export and account deletion · Supabase region `ap-south-1` (Mumbai) · never log OTP codes, tokens, full emails or card data · no personal data in URLs or query strings.

### 5.11 Audit logging

`audit_logs` is append-only. `UPDATE` and `DELETE` are revoked from every role including `service_role`. Entries are written by database trigger so they can't be bypassed by writing directly to a table. Same for `config_history`.

### 5.12 CI security gates

Every PR runs: secret scanning across full git history (gitleaks), `npm audit --audit-level=high`, a grep asserting the service-role key stays in its two allowed files, a check that no Client Component imports the admin client, and an assertion that every migration table enables RLS.

### 5.13 If something goes wrong

1. Tell the owner immediately — speed matters more than a tidy story.
2. Rotate the affected credential in the provider dashboard.
3. Check `audit_logs` and `resource_downloads` for scope.
4. Don't force-push to hide it; history rewriting doesn't unpublish a leaked key.

---

## 6. Data model & RLS

49 tables across 8 migrations in `supabase/migrations/`. Full detail in `docs/02`.

| Migration | Contents |
|---|---|
| `0001` | Extensions, enums, `updated_at` trigger |
| `0002` | `profiles`, `roles`, `permissions`, `user_roles`, RBAC seed, `handle_new_user` |
| `0003` | `feature_flags`, `app_settings`, `config_history`, `config_version` |
| `0004` | Courses, modules, lessons, enrolments, progress, resources |
| `0005` | Live sessions, recurrence engine, `get_live_join_url` |
| `0006` | `user_sessions` device lock, notifications, audit |
| `0007` | Payments, doubts, quizzes, mentorship, support *(flagged off, modelled now)* |
| `0008` | Storage buckets, `pg_cron` jobs |

**Design rules:**
1. RLS on every table. No exceptions.
2. `auth.uid()` is the only identity — never a client-supplied `user_id`.
3. Money and audit rows append-only.
4. `timestamptz` everywhere. UTC stored, IST rendered.
5. Soft-delete via `deleted_at` for user-visible content.
6. Helper functions `SECURITY DEFINER` + pinned `search_path`.

**Migrations are the only way schema changes.** Never click-edit in the Supabase dashboard — it drifts from git and breaks CI.

---

## 7. Auth, sessions and registration

### Email OTP only

No Google OAuth, no phone/SMS, no password anywhere. This removes the OAuth consent screen, Google app verification, SMS cost and TRAI DLT paperwork, and leaves one path to secure. Old mockups are full of Google sign-in modals — **that design is dead**.

`/register` uses `shouldCreateUser: true` and captures name, exam target and DPDP consent *before* the OTP, so a complete profile lands at account creation. `/sign-in` uses `shouldCreateUser: false` so signing in never silently creates an account.

**Hardening:** 6 digits · 10-minute TTL · 5 attempts then burned · 60s resend cooldown · rate limited per email and per IP · captcha after repeated failures · **the code is never logged, never in a URL, never in an API response**.

> **Setup blocker:** Supabase's built-in auth mailer is throttled to a handful per hour. **Resend SMTP must be configured in Supabase → Auth → SMTP Settings** or registration simply won't work.

### Single active session

A second login evicts the first device. This is the anti-account-sharing control and a core product requirement.

**The hard constraint:** Supabase access tokens are stateless JWTs valid for their full hour. Deleting a row does **not** invalidate a token already in a browser. So a database flag alone is *not* enforcement.

| Layer | Latency | Purpose |
|---|---|---|
| Realtime kick | < 1s | UX — evicted device sees an explanation |
| **Middleware check** | next request | **The actual enforcement** |
| Heartbeat | ≤ 60s | Catches idle tabs, updates `last_seen_at` |

Middleware caches its verdict in a signed cookie for 60s, so we hit Postgres at most once a minute per device.

**Two exemptions you must not remove:** idle logout is paused **during a live class** (a student watching a 45-minute lecture emits no pointer events) and **during a quiz attempt** (which has its own server-side timer).

**Escape hatches:** self-serve "sign out other devices", a device list, a 5-switches-per-24h cooldown (that counter *is* the account-sharing signal), and a support override.

---

## 8. Feature flags & runtime config

The client must be able to change platform behaviour **without a deploy**. Two stores:

- **`feature_flags`** — is it on? Boolean + rollout % + role/user targeting.
- **`app_settings`** — how does it behave? Typed values with per-setting validation.

**Rules:**
- **Flags fail closed.** If config can't load, return the **default**, never `true`.
- **Flags are not permissions.** A flag decides whether a feature exists; RLS decides who may touch the data. Never gate access control on a flag.
- Percentage rollouts hash on user id so a user stays on the same side across requests.
- ~30s TTL cache. Serverless functions are ephemeral, so Realtime invalidation alone is unreliable.
- **Kill switches** (`payments.enabled`, `auth.email_otp_enabled`, `ops.maintenance_mode`) require admin + step-up re-auth and are **not** developer-editable.
- Every change writes to `config_history` by trigger, with one-click revert.

Currently `src/lib/flags.ts` is a temporary shim with the same `isEnabled(key)` signature — only its body changes when the database lands.

---

## 9. Content, live classes and the calendar

**Video and documents are Google Drive links.** Store the **file ID**, never the pasted URL — URLs carry tracking params and change shape. `src/lib/drive.ts` parses all URL shapes (21 tests).

**Critical limitation:** the Drive `/preview` iframe is cross-origin and emits **no playback events**. Second-level progress and resume are impossible. Progress is **lesson-level** (opened / completed). Don't build UI that implies otherwise.

Drive also enforces a **per-file daily view quota** — hence the `drive_file_mirrors` fallback table.

**Live classes are Google Meet.** The client owns Workspace with recording; Meet recordings auto-save to Drive, and Drive links are already our pipeline — so a live class becomes a recorded lesson with one paste.

**The calendar is ours, not Google's.** A recurrence engine (weekday array + time + duration) generates sessions on a rolling 60-day horizon, idempotently. Rescheduling or cancelling acts on a **single occurrence** via `schedule_exceptions` — moving one Wednesday must not move every Wednesday.

---

## 10. Brand & UI conventions

Extracted from the live site `forensicbypriyanshi.vercel.app`:

| Token | Value | Role |
|---|---|---|
| Navy | `#1D1A39` | Body, primary text, dark sections |
| Amber | `#F59F59` | Primary CTA fill — **with navy ink** |
| Peach | `#E8BCB9` | Soft backgrounds |
| Rose | `#AF445A` | Text accent, interactive |
| Wine | `#662549` | Secondary |

Headings Poppins 700 at `-0.025em`; body Inter.

**It is not purple.** The old `style.css` was off-brand and has been retired.

**Rules:**
1. All colour from tokens in `src/app/globals.css`. **Never raw hex** in components.
2. **WCAG AA or better** — 4.5:1 body, 3:1 large text. *Measure it.* Two tokens shipped failing until measured (`success` at 4.41:1, `ink-light` at 2.5:1).
3. White on amber is ~2.1:1 and **fails** — amber is a fill colour with navy ink, never a text colour on light.
4. **Mobile-first.** Start at 375px. Tap targets ≥ 44px. Inputs ≥ 16px on mobile or iOS Safari zooms the viewport on focus.
5. Tables become card lists below `md` — six-column tables are unusable on a phone.
6. Use `dvh` not `vh` — mobile browser chrome clips `vh`.
7. Lucide icons are `forwardRef` objects and **cannot cross the Server→Client boundary**. Pass a role string and resolve the config client-side.

---

## 11. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | Drive URL parsing, coupon math, quiz scoring, signature verification |
| Component | Testing Library | Calendar IST rendering, OTP auto-advance, badge state machine |
| **DB / RLS** | **pgTAP** | **The most important tests here** |
| E2E | Playwright | Signup → enrol → lesson → live → doubt |
| a11y | axe | Zero critical violations |

**Why pgTAP matters most:** a UI bug is an annoyance; an RLS gap is one student reading another's data. `supabase/tests/rls.test.sql` has 16 assertions covering cross-user denial, join-link timing, self-enrolment being impossible, quiz answer keys being unreadable, plus a schema-wide invariant that every table has RLS on.

---

## 12. CI/CD & workflow

```bash
git checkout -b feat/short-description
npm run verify          # must pass
git commit -m "feat(scope): what changed and why"
git push -u origin feat/short-description
# open a PR against main
```

- **Conventional Commits**: `feat:` `fix:` `chore:` `docs:` `refactor:` `test:`
- `main` is protected; everything lands through a PR
- CI: format · lint · typecheck · tests · build · gitleaks · `npm audit` · three security assertions (§5.12)
- The PR template's database and auth sections matter most

**Code style:** match the surrounding code. Comments explain *why*, not *what*. Several non-obvious choices are documented inline precisely so nobody "fixes" them by accident.

---

## 13. Operations & monitoring

- **Errors:** Sentry across client/server/edge, PII scrubbed, tagged with request id and release.
- **Logs:** structured JSON via `lib/logger` — never bare `console.log`. Never log tokens, OTPs, full emails or card data.
- **Health:** `GET /api/health` returns 503 on any dependency failure so monitors alert instead of seeing a cheerful 200.
- **Scheduled jobs** run in Postgres via `pg_cron`, not Vercel cron — Vercel Hobby crons fire once per day, which cannot deliver a T-15-minute class reminder.
- **The one metric to watch:** Resend's daily send count. The free tier allows 3,000/month **but only 100/day**, and a class reminder to 200 students is 200 emails in one minute. **Digest batching is mandatory, not an optimisation.** Alert at 80/day.
- Supabase free projects pause after 7 idle days — a keep-warm cron prevents it.

---

## 13a. Domains — the app runs on a subdomain

**`app.forensicbypriyanshi.com` is this codebase. `forensicbypriyanshi.com` is the marketing site and is not.**

Nothing in the code names the host — CSP, the manifest and every route use `'self'` or relative paths — so the split needs configuration, not changes. But four things must agree, and three of them fail *silently* when they don't:

| Where | Set it to | What breaks if wrong |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` (Vercel) | `https://app.forensicbypriyanshi.com` | Email links and OTP redirects point at a page that doesn't exist |
| Supabase → Auth → **Site URL** and **Redirect URLs** | the same, plus `http://localhost:3000` | Sign-in appears to work, then bounces to the wrong origin |
| Razorpay → Webhooks | `https://app.forensicbypriyanshi.com/api/webhooks/razorpay` | Students pay and are never enrolled. **The worst failure on the list** |
| Vercel → Domains | `app.` as production; do **not** alias the apex | The marketing site gets replaced by the app |

### Why the subdomain is better here, not just different

**Cookies are host-only.** Nothing in this codebase sets a `Domain` attribute on a cookie — verified, not assumed — so the session, device and config-cache cookies belong to `app.` alone. The marketing site, and anything else ever hosted on a sibling subdomain, cannot read them. Setting `Domain=.forensicbypriyanshi.com` would throw that away; **don't**, however convenient sharing a login with a future site sounds.

**`'self'` in CSP means exactly `app.`** — a different origin from the apex. The marketing site cannot script into the app.

One caveat worth knowing: `Strict-Transport-Security` is sent with `includeSubDomains; preload` from the app. Served from `app.`, it covers `app.` and anything under it — **not** the apex. If you want the apex preloaded, it has to send its own header.

---

## 14. Current state and what's next

_Last updated 2026-08-12._

### ✅ Done

| Area | State |
|---|---|
| **Database** | **Live.** 51 tables, RLS on all 51, 86 policies, seed data applied to project `nlbofctqznasfdczfuag` |
| **Security audit** | Supabase advisor run and acted on — see below |
| **Types** | `src/types/database.ts` generated from the live schema (57 tables). **Do not hand-edit** — run `npm run db:types` |
| **UI** | 62 routes across five portals, mobile-first, verified 320→1920px with zero overflow |
| **Auth** | **Wired.** Email OTP send + verify, `claim_session` device lock, heartbeat, sign-out, role-based landing at `/portal` |
| **Route guards** | **Enforced.** Middleware resolves roles from `user_roles`, rewrites to `/403` on mismatch, and verifies the device against `user_sessions` — both cached in a signed 60s cookie |
| **Config engine** | **Live.** `lib/config/server.ts` reads `feature_flags` + `app_settings` with role targeting and stable percentage rollouts; falls back to compiled defaults if the database is unreachable |
| **Launch-scope data** | Courses, live classes and the calendar all read real rows. Dashboard, notifications, search too |
| **Course player** | `/app/learning/[id]` — lesson sidebar, Drive iframe, mark-complete, prev/next, resume-where-you-left-off |
| **Account** | `/account`, `/account/settings` (with the device list), `/search`, `/onboarding`, `/sign-out` |
| **States** | `loading.tsx` + `error.tsx` per portal, branded `not-found.tsx`, `403`, `global-error.tsx` |
| **Educator studio** | **Wired.** Schedule a recurring class (writes `class_schedules` then generates 60 days of sessions), add sections and lessons by pasting a Drive link, attach recordings, cancel a class with a reason |
| **Admin enrolments** | **Wired** to `grant_course_access()` — the only way a student gets into a course while payments are off |
| **/dev/config** | **Writable.** Toggling a flag updates `feature_flags` and drops the read cache; kill switches stay admin-only via RLS |
| **Overlays** | Toast provider, focus-trapped modal, confirm dialog, ARIA tabs — the layer the mockups assumed and nobody had built |
| **Notifications** | **Queue + Firebase Cloud Messaging.** `notification_queue` with `FOR UPDATE SKIP LOCKED` claiming, a drain worker at `/api/cron/notifications`, FCM HTTP v1 (JWT-signed, no `firebase-admin`), token registration, dead-token cleanup |
| **Class reminders** | **Firing.** `enqueue_due_reminders()` produces T-24h (push + email) and T-15m (push only) reminders, idempotent via the `reminder_*_sent_at` stamps, scheduled by pg_cron every 5 min and re-run by the worker |
| **Login-first** | **Secure by default.** Demo mode is now opt-**in** (`NEXT_PUBLIC_SHOW_HUB=true`). Verified: all nine protected prefixes redirect anonymous requests to `/sign-in`; `/terms`, `/privacy`, `/contact` stay public |
| **Legal pages** | `/terms`, `/privacy`, `/refund-policy`, `/contact` — public, required for Razorpay approval |
| **CI** | Green: format, lint, typecheck, 48 tests, build, gitleaks, `npm audit`, RLS assertion |

**The security audit found real issues worth knowing about**, because they shape how you add functions from here:

PostgREST exposes every function in `public` as an HTTP endpoint at `/rest/v1/rpc/<name>`, and Postgres grants `EXECUTE` to `PUBLIC` by default. That had left `generate_sessions()` — `SECURITY DEFINER`, writes `live_sessions` — callable by any signed-in student. Migration `20260811000100` revokes everything internal and grants back only what a signed-in user needs.

> **So: any new function in `public` is internet-facing until you revoke it.** Add a `revoke all on function … from public, anon, authenticated;` alongside every new function unless it is genuinely meant to be called over HTTP.

### ❌ Not done

**The launch-scope student journey is wired end to end. The staff portals are not.** `/studio`, `/admin`, `/support` and `/dev` still render demo arrays — they were built to be reviewed, not to be used, and nothing in the launch scope depends on them. Search `TODO(Phase 2)`.

In rough priority order:

1. **Educator studio** — schedule a class (writes `class_schedules` + `generate_sessions`), add a lesson with a Drive link, upload a recording id
2. **Admin enrolments** — wire the existing UI to `grant_course_access(email, slug, reason, days)`; **this is how students get in at launch**, since payments ship off
3. **`/dev/config`** — the read path is live, the write path is not. Toggling a flag should `UPDATE feature_flags` and call `invalidateConfigCache()`
4. **Notification delivery** — rows are written and read; nothing sends them yet. Needs the cron handler and Web Push
5. **Quizzes, notes, doubts, store, mentorship** — built as UI, flagged off, no queries

### 🔴 Security fix in migration 0015 — apply this one

Two RLS policies let **any signed-in user insert rows they should not own**. Found while building the studio write paths, fixed in `20260812000300_educator_authoring.sql`.

The pattern, on both `live_sessions` and `courses`:

```sql
for all using (educator_id = auth.uid() and public.has_role('educator'))
     with check (educator_id = auth.uid());          -- ← role check missing
```

**For INSERT, Postgres consults `WITH CHECK` only — `USING` is not evaluated.** So the entire condition for creating a live class was "set `educator_id` to yourself".

What that allowed:

- **`live_sessions`** — a student inserts a class against any `course_id` with a `join_url` they control. Every enrolled student sees it, clicks Join, and `get_live_join_url()` hands them the attacker's Meet link, because for a non-creator it checks *enrolment*, not who created the row. In-platform phishing through trusted UI. The `join_url` column REVOKE does not help — it restricts SELECT, not INSERT.
- **`courses`** — a student inserts a course with `status = 'published'`, which the "published are public" policy then shows to every visitor.

The fix requires the educator or admin role in `WITH CHECK` as well as `USING`. It deliberately does *not* require course ownership: courses seeded before the first educator account have `created_by = null`, and that stricter rule would lock the real educator out of her own courses. Role is what stops the attack.

> **The lesson worth carrying:** on a `FOR ALL` policy, `USING` and `WITH CHECK` are different gates. If you only write `USING`, Postgres reuses it for both — which is safe. If you write **both**, the `WITH CHECK` is the *only* thing guarding INSERT. Every `FOR ALL … USING … WITH CHECK …` in this repo deserves a second read.

**Migration 0018 is the systematic sweep for the rest of that class**, plus a standing check:

| Table | What was possible | Fix |
|---|---|---|
| `quizzes` | Any student inserts a `published` quiz against any course; enrolled students see it. Fabricated exam content wearing the platform's authority. | Require educator/admin in `WITH CHECK` |
| `mentorship_slots` | Any student advertises fake 1:1 sessions, with a price, to every signed-in user | Require educator/admin in `WITH CHECK` |
| `doubt_answers` | **The worst one.** `is_educator_verified` was settable by the poster, so any student could publish a wrong answer badged as officially endorsed | Non-staff must post it `false`; a new UPDATE policy lets educators promote later |
| `enrollments` | `for update using (is_staff())` — a *developer* could revoke a paying student's access, a *support* agent could grant themselves a paid course. Neither is in the RBAC matrix. | Narrowed to admin, matching `grant_course_access()`. Support keeps read. |

> **Feature flags do not mitigate any of this.** Quizzes, doubts and mentorship all ship switched off — but a flag hides the *UI*. PostgREST still serves `/rest/v1/quizzes` to any signed-in user. RLS is the only control.

Run this after any migration that touches policies:

```sql
select * from public.audit_policy_asymmetry();
```

It lists every `FOR ALL` policy whose `WITH CHECK` differs from its `USING`. Not every result is a bug — asymmetry is sometimes intended — but both real vulnerabilities found so far showed up in it.

### ⚠️ Two deliberate limitations, so nobody "fixes" them by accident

- **`auth.enforce_route_guards` is env-driven, not database-driven.** Every product feature is a database flag, but a kill switch that can turn off authentication is not a product feature — a bad row would open every portal to anyone. It is derived from `NEXT_PUBLIC_SHOW_HUB` at build time and lives in `lib/flags.ts`.
- **Progress is lesson-level only.** The Drive `/preview` iframe is cross-origin and emits no playback events, so watch time and resume points are not obtainable. Hence the explicit "Mark complete" button rather than an inferred percentage.

### ⏳ Blocked on the owner

- **Resend SMTP inside Supabase Auth** — still the real launch blocker. Supabase's built-in mailer is throttled to a handful per hour, so **no student can sign up** until this is configured. Everything above it is now built and waiting on it.
- **Run `supabase/bootstrap/RUN-NEXT-session-and-seed.sql`** in the SQL editor, then `npm run db:types`. Until then the heartbeat, sign-out and mark-all-read functions do not exist and `lib/supabase/rpc.ts` is bridging them.
- **Set `SESSION_COOKIE_SECRET`** (`openssl rand -base64 32`) in `.env.local` and Vercel. Optional — without it the middleware device/role check runs on every request instead of once a minute. Slower, never less safe.
- `SUPABASE_SERVICE_ROLE_KEY` into `.env.local`
- Real Google Drive file ids on the seeded lessons — they ship as `kind='text'` because the schema rightly refuses a video lesson with no file
- Google Workspace tier confirmation (Meet participant cap)
- Whether Sunday is staffed for support (hours are 11:00–19:00 IST; days assumed Mon–Sat)

---

## 15. Deep-dive documents

| Part | Document | Depth on |
|---|---|---|
| — | [`docs/06-PRD.md`](docs/06-PRD.md) | Personas, sizing, requirements by priority, metrics, cost, risks |
| 0 | [`docs/00-OVERVIEW-DECISIONS-ROADMAP.md`](docs/00-OVERVIEW-DECISIONS-ROADMAP.md) | Locked decisions, constraints, phase plan |
| 1 | [`docs/01-SYSTEM-ARCHITECTURE.md`](docs/01-SYSTEM-ARCHITECTURE.md) | Architecture, API surface, backend flows, PWA |
| 2 | [`docs/02-DATABASE-SCHEMA.md`](docs/02-DATABASE-SCHEMA.md) | Every table, policy, index, trigger, cron job |
| 3 | [`docs/03-SECURITY-OPS-CICD-SCALING.md`](docs/03-SECURITY-OPS-CICD-SCALING.md) | RBAC matrix, security controls, CI/CD, scaling, LiveKit v2 |
| 4 | [`docs/04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md`](docs/04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md) | Device lock, OTP, recurrence engine, push |
| 5 | [`docs/05-REGISTRATION-AND-PLATFORM-CONFIG.md`](docs/05-REGISTRATION-AND-PLATFORM-CONFIG.md) | Registration flow, flag engine, flag registry |
| — | [`docs/07-UI-TASKS.md`](docs/07-UI-TASKS.md) | UI/UX work queue for the contributor |
| — | [`docs/08-EMAIL-SETUP.md`](docs/08-EMAIL-SETUP.md) | **SES runbook** — SMTP vs IAM credentials, the sandbox trap, DNS, costs |
| — | [`docs/09-PAGES-AND-DECISIONS.md`](docs/09-PAGES-AND-DECISIONS.md) | **Every route, what guards it, and why.** Read before adding a page |

---

## Stuck?

Open a draft PR early with the question in the description, or raise a GitHub issue. Partly-working code with a clear question beats a week of silence.
