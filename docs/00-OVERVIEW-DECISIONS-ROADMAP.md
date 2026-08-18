# FSP Platform — Part 0: Scope, Decisions & Roadmap

**Project:** Forensic Science by Priyanshi (FSP) — Ed-Tech PWA
**Version:** v1 — Google Drive content + Google Meet live + email-OTP auth
**Date:** 2026-08-05 · **Scale: ~200 students**

---

## ⚠️ Sizing: 200 students, not 6,240

**The entire customer base is ~200 students** (confirmed 2026-08-05). Every number in `FSP_Frontend_UI_Package` — *"6,240 Registered Students"*, *"284 Students Attending"*, *"₹12,48,900"* — is placeholder demo content. Do not design to it.

| Metric | Real value |
|---|---|
| Registered students | ~200 |
| Peak concurrent live attendance | **80–120** (40–60% of roster typically attend live) |
| Peak concurrent app users | ~150 |
| Emails/month | ~2,000 |
| Database size, year 1 | < 100 MB |

**What this removes from the plan entirely:** read replicas · table partitioning · Upstash Redis · materialised KPI views · CDN tiers · multi-region · LiveKit v2. At 200 rows, `count(*)` is free; at 200 students, every free tier except Vercel is comfortable.

**What it does not remove:** RLS on every table, webhook signature verification, server-side pricing and quiz scoring, the session lock, audit logs. Security is not a function of scale — a 200-student platform leaking one student's data to another is exactly as broken as a 200,000-student one.

Full sizing rationale and cost model: **Part 6 (PRD) §2 and §8**.

---

## 1. What we are building

A single Progressive Web App (installable, offline-capable, mobile-first) serving **five roles**:

| Role | Portal | Core jobs |
|---|---|---|
| Student | `/app` | Browse & buy courses, watch lessons, join live classes from a calendar, download notes/DPPs, take mock tests, ask doubts, book 1:1 |
| Educator | `/studio` | Create courses, paste Google Drive links, schedule live classes, answer doubts, build quizzes, broadcast announcements, view analytics |
| Admin | `/admin` | KPIs, RBAC, course approvals, payments & refunds, coupons, audit logs |
| Support | `/support` | Ticket queue, live chat, account/OTP helper, doubt escalation |
| Developer | `/dev` | Health, API keys, webhooks, logs, feature flags |

The existing `FSP_Frontend_UI_Package/` is the **visual source of truth**. Its design tokens, components and screen inventory are ported to React; the static HTML is not deployed.

---

## 2. Six findings that shape the architecture

These came out of reading the UI package and the free-tier terms. Each one changes a decision, so read them before the stack.

### F1 — Vercel Hobby forbids commercial use
Vercel's Hobby plan is **non-commercial only**. This platform sells courses and books, so it is commercial. Preview/staging on Hobby is fine; **production selling anything must be on Vercel Pro (~$20/mo)**.
**Decision:** build free on Hobby through Phase 4; budget Pro before the first real rupee is collected. Alternative if ₹0 is a hard rule: Cloudflare Pages/Workers (free tier permits commercial use) — but that costs us Next.js ISR/Image ergonomics.

### F2 — Google Meet is the v1 provider; Workspace is already in place
**Decision (confirmed 2026-08-05): Google Meet delivers all v1 live classes**, matching the mockups exactly. **Google Workspace is already owned, with cloud recording enabled.** The 60-minute free-account cut-off does not apply.

**One number still to confirm: the participant cap is per Workspace tier.**

| Tier | Max participants | Recording | Attendance report |
|---|---|---|---|
| Business Starter | 100 | ❌ | ❌ |
| **Business Standard** | **150** | ✅ → Drive | ❌ |
| Business Plus | 500 | ✅ → Drive | ✅ |
| Enterprise | 1000 | ✅ → Drive | ✅ |

Recording puts you at **Standard or above — and at 200 students with realistic 40–60% live attendance (80–120 concurrent), Standard's 150 cap is sufficient.** The earlier concern was based on the mockup's fictional 284 attendees; at true scale this is largely a non-issue.

**Still verify the tier in Admin console → Billing before Phase 3,** and check it against your own best-attended class. If a single session ever exceeds 150, the fix is a billing upgrade to Business Plus, not code.

**This unlocks the recording loop** — see Part 1 §6.4. Meet recordings land in Drive automatically, and Drive links are already the content pipeline, so every live class becomes a recorded lesson with a single paste. Business Plus additionally exports an attendance CSV we can import into `session_attendance`.

The `live_sessions.provider` enum still carries `youtube` and `livekit` as unbuilt values. Meet is the default and the only provider implemented in v1; keeping the others costs nothing and makes an overflow fallback or the v2 LiveKit cutover a per-session dropdown change rather than a rewrite.

### F3 — Google Drive video gives you no playback telemetry
Drive's `/preview` iframe is cross-origin and emits **no time-update events**. So in v1 we cannot compute "65% complete" or "42 mins remaining" the way the Student Dashboard mockup shows.
**Decision:** v1 progress = **lesson-level** (opened / marked complete), not second-level. The UI progress bars stay, but they are driven by `completed_lessons / total_lessons`. Second-level resume arrives with a real video host (v2). Also note Drive enforces a **per-file daily view quota** — a popular lesson can hard-fail with "sharing limit exceeded". Mitigation in Part 1 §6.

### F4 — The current CSS has zero media queries
`style.css` + `components.css` contain **no `@media` rules at all**. Sidebar is a fixed `250px`, content padding is `32px 48px`, and several grids are hardcoded `2fr 1fr` inline. The package is desktop-only today.
**Decision:** the React port is a **mobile-first rewrite of layout** while keeping 100% of the tokens, colors, radii, shadows and component look. Mobile gets a bottom tab bar + drawer; desktop keeps the sidebar. This is real work, not a `flex-wrap` fix — it is scoped as its own phase.

### F5 — Supabase free tier sleeps
Free projects **pause after 7 days of inactivity**, cap at **500 MB database / 1 GB storage / 5 GB egress / 50k MAU**, and have **no daily backups**.
**Decision:** keep heavy bytes *out* of Supabase (video → Drive/YouTube, images → Cloudinary), run a daily cron that both keeps the project warm and `pg_dump`s to an external bucket. Storage budget in Part 3 §7.

### F6 — This is not a git repository yet
`WEBAPP/` has no `.git`. Version control is Phase 0, task 1.

---

## 3. Locked technology decisions

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server Components cut client JS; Route Handlers give us a backend without a second deploy; first-class on Vercel |
| Styling | **Tailwind CSS v4 + CSS variables from `style.css`** | Tokens port verbatim as `@theme`; utility classes fix the responsive gap fast |
| Components | **shadcn/ui (owned source) + custom FSP primitives** | Accessible Radix behaviour, but we restyle to the existing look — no vendor lock |
| Icons | **lucide-react** | Same icon set the mockups already use |
| PWA | **Serwist** (`@serwist/next`) | `next-pwa` is unmaintained; Serwist is the maintained successor |
| Auth | **Supabase Auth — email 6-digit OTP only** | No Google OAuth, no phone/SMS, no password. One auth path to secure, no SMS cost, no TRAI DLT paperwork. Part 5 §1 |
| Database | **Supabase Postgres + Row Level Security** | RLS is the enforcement layer; app code cannot leak rows |
| Server state | **TanStack Query** + Supabase Realtime | Cache + optimistic updates; Realtime for chat, notifications, live counts |
| Forms/validation | **react-hook-form + Zod** (shared client/server schemas) | One schema validates the form and the API |
| Images | **Cloudinary** (banners, thumbnails, avatars, product shots) | Free transformations + CDN; keeps Supabase's 1 GB free |
| Documents | **Supabase Storage**, private bucket + signed URLs | Notes/DPPs need per-user access control and watermarking |
| Video (v1) | **Google Drive** `/preview` iframe (recorded) · **Google Meet** (live) | Your requirement; zero storage cost. Meet needs Workspace Business Plus — see F2 |
| Video (v2) | **LiveKit** (self-hosted) + HLS egress | Real interactive rooms, our infra |
| Payments | **Razorpay** (UPI/cards/netbanking/EMI) | India-first, already all over the mockups |
| Email | **Resend + React Email** | Your requirement; typed templates, 3k/mo free |
| Scheduling | **Supabase `pg_cron` + `pg_net`** | Vercel Hobby crons run **once per day** — useless for T-15min reminders. `pg_cron` does minute granularity, free |
| Rate limiting | **Postgres counters table** (Upstash Redis documented as the upgrade) | At ~150 peak users a DB round-trip per limited route is negligible. Drops a whole vendor. Switch to Upstash only if traffic ever justifies it |
| Config | **`feature_flags` + `app_settings`, edited from `/dev/config`** | Client requirement: every feature flagged, everything editable without a deploy. Part 5 §3 |
| Errors | **Sentry** (client + server + edge) | Free tier, source maps, release tracking |
| Logs/uptime | **Axiom** or **Better Stack** free + `/api/health` | Vercel log retention on Hobby is ~1 hour |
| CI | **GitHub Actions** | Free for public/small private; native Vercel + Supabase CLI |
| Tests | **Vitest** · **Playwright** · **pgTAP** | pgTAP is non-negotiable — RLS bugs are data breaches |

---

## 4. Assumptions I am proceeding on

Flagging these rather than blocking. Correct me and I will adjust the affected phase.

1. ~~Razorpay in v1~~ — **confirmed 2026-08-05, and the account is KYC-ready.** Full checkout, coupons, webhooks, auto-enrolment, refunds and invoices ship in Phase 4 with no external blocker. Build against test keys, flip to live keys at launch.
2. **Currency INR, timezone Asia/Kolkata, language English.** All timestamps stored UTC (`timestamptz`), rendered IST.
3. **Custom domain owned** (e.g. `forensicbypriyanshi.com`) — required for Resend DKIM/SPF and for OAuth redirect URLs.
4. **Educators paste links manually in v1.** No Google Calendar/Drive API integration until v1.5 (that needs OAuth scopes + verification).
5. **Content is not DRM-protected.** Drive links can be shared; PDFs can be re-uploaded. We mitigate (watermarks, signed short-lived URLs, download disabled, device-count limits) but cannot prevent. This is true of every ed-tech platform at this budget.
6. **Single educator (Priyanshi) + a small staff.** Schema supports many; UX optimises for few.

---

## 5. Roadmap — the "one by one"

Each phase is independently shippable and ends with something you can click. Durations assume one focused developer.

### Phase 0 — Foundations · ~3 days
Git repo + `main`/`develop` + branch protection · Next.js 15 + TS + Tailwind scaffold · **design tokens ported from `style.css`** · Supabase projects (prod + staging) · Cloudinary, Resend, Sentry, Upstash accounts · `.env.example` · GitHub Actions skeleton (lint/typecheck/build) · Vercel linked with preview deploys.
**Done when:** a PR opens a preview URL rendering the FSP-branded shell.

### Phase 1 — Registration, auth, RBAC, config & PWA shell · ~2 weeks
**`/register` + `/sign-in` on email OTP** (no OAuth, no phone) · Resend SMTP wired into Supabase Auth · onboarding · `profiles`/`roles`/`permissions` + RLS · **single-active-session device lock + idle auto-logout** · **the feature-flag and settings engine** (`feature_flags`, `app_settings`, `config_history`, `/dev/config`) · middleware route guards · the five app shells **mobile-first** (bottom tabs + drawer on small, sidebar on large) · installable PWA · welcome email.
**Done when:** you register by email OTP on a phone, install to home screen, land in the correct portal, get evicted when you sign in elsewhere — and can toggle a feature from `/dev/config` without a deploy.

> Grown from ~1 week because the config engine and session lock both landed here. Both are correct to build now: retrofitting flags into shipped features costs several times more, and session enforcement cannot be bolted onto auth later without reworking it.

### Phase 2 — Content core · ~2 weeks
Courses/modules/lessons schema · **Google Drive link ingestion** (paste → parse file ID → validate → auto-thumbnail → Cloudinary banner) · educator course builder · student catalogue + course player · notes/DPP vault (Supabase Storage, signed URLs, watermark) · lesson-level progress.
**Done when:** Priyanshi pastes a Drive link and a student watches it in-app with a branded banner.

### Phase 3 — Live classes & calendar · ~1.5 weeks
`live_sessions` schema with `provider` · **month/week/agenda calendar** (mobile-first, IST) · educator scheduler (paste **Google Meet** link + Drive material) · **time-gated join link** via `SECURITY DEFINER` RPC (link only exists T-15m → T+30m, enrolled users only) · `pg_cron` reminders at T-24h and T-15m via Resend + push · live chat via Supabase Realtime · attendance log.
**Prerequisite:** Google Workspace tier purchased (F2).
**Done when:** a student sees Sunday's class on a calendar, gets an email 15 min before, taps Join, and lands in the room.

### Phase 4 — Payments & store · ~1.5 weeks
Razorpay order creation · **signature-verified webhook with idempotency** · orders/order_items/payments/refunds · coupon engine · auto-enrolment on `payment.captured` · invoice email · admin refund flow · physical-product shipping fields.
**Done when:** ₹1 test payment auto-enrols and emails an invoice.
**Gate:** move to Vercel Pro here (F1).

### Phase 5 — Engagement · ~2 weeks
Doubts forum (post, upvote, educator-verified answers, attachments) · notification centre (in-app + Web Push + email, per-user prefs) · announcements/broadcasts · **quiz engine** (timed runner, question palette, negative marking, auto-scoring, scorecard) · 1:1 mentorship slot booking.
**Done when:** every notification card in your mockups is backed by a real event.

### Phase 6 — Ops portals · ~1.5 weeks
Admin KPIs (materialised views) · RBAC editor · course approval workflow · payments ledger · **immutable audit log** (append-only, trigger-written) · support tickets + live chat + escalation · developer console (health, API keys, webhook replay, feature flags).
**Done when:** admin/support/dev dashboards run on live data.

### Phase 7 — Hardening · ~1.5 weeks
Rate limiting on every mutating route · security headers + CSP · Sentry across runtimes + alert rules · log shipping · uptime monitors + on-call alerts · **pgTAP RLS suite** · Playwright critical-path E2E · axe a11y · Lighthouse PWA ≥ 90 · k6 load smoke · backup/restore drill · runbook.
**Done when:** you can prove, not assume, that a student cannot read another student's data.

### Phase 8 — v2 LiveKit · **deferred indefinitely**

> At 200 students with Meet working, LiveKit costs ~₹3,000/month and two weeks to solve a problem you do not have. Revisit only if a class exceeds your Workspace cap or you need stage/polls/breakouts. The `provider` column keeps the door open at zero cost. Original plan retained below for that day:

*~2 weeks, when needed*
VPS provisioning (Hetzner/Contabo) · LiveKit + Redis + TURN + Ingress/Egress via Docker Compose · token-minting API with role grants · recording egress → Cloudflare R2 → HLS playback · in-app classroom (stage, hand-raise, polls, moderation) · per-session cutover behind a feature flag.
**Done when:** one real class runs on LiveKit while others still run on YouTube/Meet.

---

## 6. Document map

| Part | File | Contents |
|---|---|---|
| 0 | `00-OVERVIEW-DECISIONS-ROADMAP.md` | ← you are here |
| 1 | `01-SYSTEM-ARCHITECTURE.md` | Architecture diagram, repo layout, frontend, API surface, backend flows, storage, Drive/Meet/calendar logic, PWA |
| 2 | `02-DATABASE-SCHEMA.md` | Full Postgres schema, RLS policies, indexes, triggers, cron jobs |
| 3 | `03-SECURITY-OPS-CICD-SCALING.md` | Auth/RBAC matrix, security, rate limiting, observability, CI/CD, testing, free-tier ceilings, scaling, LiveKit v2 |
| 4 | `04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md` | Single-active-session device lock + idle auto-logout · email OTP · our own recurring calendar engine (no Google Calendar) · cross-device push notifications |
| 5 | `05-REGISTRATION-AND-PLATFORM-CONFIG.md` | **Registration flow (email OTP only, no Google/phone) · runtime feature-flag + settings engine editable from the developer console** |
| 6 | `06-PRD.md` | **Product Requirements Document** — personas, 200-student sizing, functional requirements by priority, NFRs, success metrics, cost model, release plan, risks |
