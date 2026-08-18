# FSP Platform — Part 3: Auth, Security, Ops, CI/CD, Testing & Scaling

---

## 1. Authentication

**Email 6-digit OTP is the only authentication method.** Google OAuth and phone/SMS OTP were both removed on 2026-08-05 — see Part 5 §1 and §2.1a.

| Method | Used by | Notes |
|---|---|---|
| **Email 6-digit OTP** | Everyone | The only login and registration path. Feeds the existing `initOtpFields()` modal. **No password exists in the system** |
| ~~Google OAuth~~ | — | Removed. The `googleAuthModal` mockups are dead design |
| ~~Phone OTP~~ | — | Removed. No SMS provider, no TRAI DLT registration, no per-message cost |
| **Step-up re-auth** | Refunds, role grants, key revocation, protected config changes | Fresh OTP required within 5 min for destructive actions |

**Hard prerequisite:** Supabase's built-in auth email is throttled to a handful of messages per hour. **Resend SMTP must be configured in Supabase → Auth → SMTP Settings**, or registration does not work at all. This is the single most likely Phase 1 blocker.

**Session handling:** Supabase SSR client with cookie storage (`@supabase/ssr`), `httpOnly` + `secure` + `sameSite=lax`, refresh in `middleware.ts` on every request. Access token 1h, refresh 30d. `signOut({ scope:'global' })` on password/role change.

`middleware.ts` responsibilities, in order: refresh session → resolve roles → guard route prefix → attach `x-request-id` → apply edge rate limit. Unauthenticated hits on a protected prefix redirect to `/sign-in?next=…`; wrong-role hits render 403 (**not** a redirect — a redirect leaks which routes exist).

---

## 2. RBAC permission matrix

`role_permissions` seed. `admin` implicitly holds everything.

| Permission | student | educator | support | developer | admin |
|---|:--:|:--:|:--:|:--:|:--:|
| `course.view.enrolled` | ✅ | ✅ | ✅ | — | ✅ |
| `course.create` / `course.edit.own` | — | ✅ | — | — | ✅ |
| `course.publish` | — | — | — | — | ✅ |
| `course.approve` | — | — | — | — | ✅ |
| `lesson.upload` | — | ✅ | — | — | ✅ |
| `live.schedule` / `live.broadcast` | — | ✅ | — | — | ✅ |
| `live.join` | ✅ | ✅ | ✅ | — | ✅ |
| `doubt.create` | ✅ | — | — | — | ✅ |
| `doubt.answer.verified` | — | ✅ | — | — | ✅ |
| `quiz.create` / `quiz.publish` | — | ✅ | — | — | ✅ |
| `quiz.attempt` | ✅ | — | — | — | ✅ |
| `payment.view.own` | ✅ | — | — | — | ✅ |
| `payment.view.all` | — | — | ✅ | — | ✅ |
| `payment.refund` | — | — | — | — | ✅ |
| `coupon.manage` | — | — | — | — | ✅ |
| `user.view` | — | — | ✅ | — | ✅ |
| `user.suspend` / `user.role.grant` | — | — | — | — | ✅ |
| `ticket.manage` | — | — | ✅ | — | ✅ |
| `apikey.manage` / `flag.toggle` / `webhook.replay` | — | — | — | ✅ | ✅ |
| `audit.view` | — | — | ✅ | ✅ | ✅ |

**Enforced in three places, every time:** (1) RLS policy — the real boundary; (2) API handler `requirePermission()` — clean errors; (3) UI — hide what they cannot do. UI-only enforcement is not enforcement.

---

## 3. Security controls

### 3.1 Headers & CSP (`next.config.ts`)

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-{N}' https://checkout.razorpay.com;
  frame-src https://drive.google.com https://www.youtube.com https://api.razorpay.com;
  img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://drive.google.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://*.sentry.io;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(self), geolocation=()
```
`camera`/`microphone` stay `self` — v2 LiveKit needs them.

### 3.2 The non-negotiables

| Risk | Control |
|---|---|
| Data leak between students | **RLS on every table** + pgTAP suite asserting cross-user denial |
| Service-role key exposure | `SUPABASE_SERVICE_ROLE_KEY` server-only; CI greps for it in client bundles and fails the build |
| Forged payment | HMAC-SHA256 on **raw body**, timing-safe compare, before JSON parse |
| Duplicate webhook / double enrolment | `unique(provider, event_id)` on `webhook_events` as the gate |
| Price tampering | Server re-prices from DB; client-sent amounts ignored entirely |
| Coupon abuse | Server validation + `per_user_limit` + atomic `used_count` increment inside the txn |
| Quiz answer leak | `is_correct` never leaves the server; scoring server-side; timer from `expires_at` |
| Live link leak | Column-level revoke + `SECURITY DEFINER` time window (Part 1 §6.3) |
| Note redistribution | 60s signed URLs, per-user PDF watermark, `resource_downloads` audit |
| XSS in doubts/chat | Store raw, render sanitised (DOMPurify + strict markdown allowlist); never `dangerouslySetInnerHTML` on user text |
| SQL injection | Parameterised via supabase-js/PostgREST; no string-built SQL |
| Brute force | Rate limits §4 + Supabase Auth's own throttle + captcha (hCaptcha) after 3 failures |
| Account takeover | Email alert on new-device login; `signOut` all sessions on role change |
| Secrets in git | `.env*` git-ignored, `.env.example` committed, Gitleaks in CI |
| Dependency CVEs | Dependabot + `npm audit --audit-level=high` in CI |

### 3.3 Privacy (India DPDP Act)

Collect the minimum; publish privacy policy + terms; consent checkbox at signup with timestamp; self-serve **data export** (JSON) and **account deletion** (30-day soft window, then hard delete + Cloudinary/Storage purge); document that Supabase/Vercel/Cloudinary process data abroad; pick Supabase's `ap-south-1` (Mumbai) region for latency and data-residency comfort.

---

## 4. Rate limiting

**At 200 students, Postgres counters are the primary implementation** — peak concurrency is ~150, so an indexed round-trip on the handful of rate-limited routes costs nothing and removes a vendor entirely. The Upstash Redis design below is the documented upgrade path, not the day-one choice. Use the `check_rate_limit` function at the end of this section.

| Bucket | Limit | Key |
|---|---|---|
| Auth: OTP send | 5 / 15 min | IP + email |
| Auth: OTP verify | 10 / 15 min | IP |
| Auth: OAuth callback | 20 / min | IP |
| `POST /api/checkout/order` | 10 / min | user |
| `POST /api/live/:id/join` | 30 / min | user |
| `POST /api/quiz/:id/submit` | 5 / min | user |
| Doubt / answer create | 10 / hour | user |
| Live chat message | 20 / min | user |
| Resource download | 30 / hour | user |
| Search | 60 / min | user |
| Global API default | 100 / min | user, else IP |
| Webhooks | **unlimited** | signature-gated; never throttle your payment provider |

Responses carry `X-RateLimit-Limit/Remaining/Reset` and return **429** with `Retry-After`; the client surfaces it through the existing warning-toast style.

**The day-one implementation** — a Postgres function on an unlogged counters table:

```sql
create unlogged table rate_limits (
  key text primary key, count int not null default 0, window_start timestamptz not null default now());

create or replace function public.check_rate_limit(p_key text, p_max int, p_window interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into rate_limits (key, count, window_start) values (p_key, 1, now())
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - p_window then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - p_window then now() else rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;
```
Slower (a DB round-trip per request) and it consumes your 500 MB — fine at low volume, switch to Upstash when traffic grows.

---

## 5. Observability

### 5.1 Errors — Sentry
`@sentry/nextjs` across client, server and edge runtimes. Source maps uploaded in CI and **deleted from the deployment**. `tracesSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`. `beforeSend` scrubs emails, phones, tokens and card data. Tag every event with `requestId`, `userId`, `role`, `route`, `release`.

### 5.2 Logs — structured JSON
One logger (`lib/logger.ts`), never bare `console.log`:
```json
{"level":"info","ts":"…","requestId":"…","userId":"…","route":"/api/checkout/order",
 "event":"order.created","orderId":"…","amount":149900,"durationMs":142}
```
Vercel Hobby retains ~1 hour, so drain to **Axiom** or **Better Stack** free tier for 30-day searchable retention. Never log tokens, OTPs, full emails, card data or Drive URLs.

### 5.3 Uptime & health
`GET /api/health` returns `{db, storage, redis, commit, uptime}`. Better Stack / UptimeRobot pings it every minute from 2 regions, plus a synthetic Playwright check hourly on the sign-in → dashboard path.

### 5.4 Alerts — routed by severity

| Severity | Trigger | Channel |
|---|---|---|
| **P1 page** | Site down 2 min · webhook failure rate > 5% · DB unreachable · payment success rate < 90% over 15 min | SMS + call |
| **P2 urgent** | Error rate > 1% over 10 min · p95 latency > 3 s · Supabase storage > 80% · live session starting with 0 attendees | Email + WhatsApp/Slack |
| **P3 notice** | New error type · Cloudinary credits > 70% · cron job missed · SSL expiring in 14 days | Email digest |
| **Business** | Refund spike · coupon over-use · signup drop > 50% DoD | Daily Resend digest to admin |

### 5.5 Product analytics
PostHog free tier (self-hostable later) or Vercel Analytics for Core Web Vitals. Track: signup funnel, course view → checkout → paid, lesson completion, live attendance rate, doubt response time, DAU/WAU. Cookieless where possible.

---

## 6. CI/CD, version control & testing

### 6.1 Git
Trunk-based: `main` (production, protected) ← squash-merged PRs from `feat/*`, `fix/*`, `chore/*`. `develop` optional as a staging integration branch. **Conventional Commits** (`feat(live): add calendar agenda view`) → auto-changelog. Protection on `main`: PR required, 1 approval, all checks green, no force-push, signed commits, linear history. Tag releases `v1.2.0`; `.github/PULL_REQUEST_TEMPLATE.md` carries a migration + RLS + rollback checklist.

### 6.2 Pipeline

```
PR opened
 ├─ lint (eslint) · format (prettier) · typecheck (tsc --noEmit)
 ├─ unit tests (vitest, coverage ≥ 70% on lib/ and features/*/api)
 ├─ build (next build) — fails on any type error
 ├─ secret scan (gitleaks) + service-role-key-in-client-bundle grep
 ├─ npm audit --audit-level=high
 ├─ supabase db lint  +  RLS-coverage check (every table has ≥1 policy)
 ├─ pgTAP RLS suite against an ephemeral Postgres
 ├─ Vercel Preview deploy
 ├─ Playwright E2E against the preview URL
 └─ Lighthouse CI (perf ≥ 85, a11y ≥ 95, PWA ≥ 90)

merge to main
 ├─ supabase db push  (migrations → production)
 ├─ supabase gen types → commit if changed
 ├─ Vercel production deploy
 ├─ Sentry release + source maps + commit association
 ├─ smoke test production /api/health
 └─ auto-rollback (vercel rollback) if smoke fails
```

Environments: **Local** (Supabase CLI, Docker) → **Preview** (staging Supabase project, Razorpay test keys) → **Production**. Free tier gives 2 Supabase projects, exactly enough.

Secrets live in GitHub Environments + Vercel env vars, scoped per environment, rotated quarterly. `.env.example` is the contract; a missing var fails `next build` via a Zod-validated `env.ts`.

### 6.3 Testing pyramid

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | Drive URL parsing (all 5 shapes + garbage), coupon math, quiz scoring with negative marking, date/timezone helpers, signature verification |
| Component | Testing Library | Calendar renders correct IST days, session badge state machine, OTP auto-advance + backspace, quiz palette |
| **DB / RLS** | **pgTAP** | Student A cannot read Student B's orders/progress/attempts · non-enrolled cannot read lessons · `join_url` unreadable pre-window · student cannot INSERT enrollments · `is_correct` unreadable |
| Integration | Vitest + Supabase local | Webhook idempotency (same event twice → one enrolment), enrolment transaction rollback |
| E2E | Playwright | Signup → browse → coupon → pay (test mode) → enrolled → open lesson → join live → download note → post doubt → take quiz. Run on mobile + desktop viewports |
| a11y | axe-playwright | Zero critical violations |
| Load | k6 | 500 virtual users on the calendar + join endpoint before a big class |
| Manual | Checklist | Real device matrix: Android Chrome, iOS Safari (PWA install), iPad, low-end Android on 3G |

**The pgTAP suite is the highest-value test file in this project.** An RLS gap is a data breach; a UI bug is an annoyance.

```sql
-- supabase/tests/rls_enrollment.sql
begin; select plan(3);
set local role authenticated;
set local request.jwt.claims to '{"sub":"<student-a-uuid>","role":"authenticated"}';

select is_empty(
  $$select * from lessons where course_id = '<course-student-a-is-not-in>'$$,
  'non-enrolled student cannot read lessons');

select throws_ok(
  $$select get_live_join_url('<future-session>')$$, 'P0001',
  'join url is withheld before the T-15m window');

select is_empty(
  $$select * from orders where user_id <> '<student-a-uuid>'$$,
  'student cannot read another student''s orders');

select * from finish(); rollback;
```

---

## 7. Free-tier ceilings & the scaling path

Verify current numbers before committing — providers change these.

| Service | Free allowance | What breaks first | Next step |
|---|---|---|---|
| **Vercel Hobby** | 100 GB bandwidth, 1 concurrent build | **Commercial use is prohibited (F1)** | **Pro $20/mo — required before selling** |
| **Supabase Free** | 500 MB DB · 1 GB storage · 5 GB egress · 50k MAU · **pauses after 7 days idle** · no backups | DB size, then egress | Pro $25/mo (8 GB DB, 100 GB egress, PITR) |
| **Cloudinary Free** | ~25 credits/mo (≈25 GB storage *or* bandwidth *or* 25k transforms) | Bandwidth once banners are everywhere | Plus ~$99/mo, **or** move images to Cloudflare R2 + Images (~$5) |
| **Resend Free** | 3,000/mo, 100/day, 1 domain | 100/day cap on a big announcement | $20/mo (50k) |
| **Upstash Free** | ~10k commands/day | Rate-limit checks at scale | Pay-as-you-go, cents |
| **Sentry Free** | 5k errors/mo, 1 seat | A single error loop burns the quota | Team $26/mo |
| **Google Drive** | 15 GB personal / per-file daily view quota | Quota on popular lessons (F3) | Workspace ₹136/user/mo, or move video off Drive |
| **Google Meet free** | 100 participants, **60 min** for 3+ | Immediately, at your class sizes (F2) | YouTube Live (free) or Workspace, then LiveKit |

### At your actual scale (200 students)

**Total cost ≈ ₹1,800/month — Vercel Pro and nothing else.** Every other service sits comfortably inside its free tier. Full model in Part 6 §8.

| Service | Headroom at 200 students |
|---|---|
| Supabase | Year-1 DB < 100 MB against a 500 MB cap. Comfortable |
| Cloudinary | Banners and avatars only — video never touches it. Comfortable |
| **Resend** | ~2,000/month against 3,000 — **but the 100/day cap is the real limit.** A reminder to 200 students is 200 emails in one minute. **Digest batching is mandatory, not an optimisation** |
| Vercel Pro | 1 TB bandwidth vs our tens of GB. Enormous headroom |
| Google Meet | 80–120 concurrent vs a 150 cap on Business Standard. Adequate, verify your tier |
| Google Drive | Per-file daily view quota is generous relative to 200 viewers |

**The one metric to actually watch: Resend's daily send count.** Alert at 80 emails/day. Nothing else will bite you in year one.

**Growth checkpoints — only if the business grows**

| Students | Actions |
|---|---|
| **200 (today)** | Free tiers + Vercel Pro. Postgres rate limiting. No Redis, no materialised views, no partitioning |
| 500 | Resend paid ($20/mo) · watch Supabase DB size monthly |
| 1,000–2,000 | Supabase Pro for PITR backups · move images to Cloudflare R2 · materialised KPI views · consider Upstash |
| 5,000+ | Read replicas · **video off Drive** onto Mux/Bunny/Cloudflare Stream · partition `audit_logs`/`notifications` by month · re-evaluate LiveKit |

**Do not pre-build any of these.** Each is a day or two of work when the number is actually hit, and premature versions become dead code.

**Cheap performance wins, in order:** ISR the public catalogue · `next/image` + Cloudinary `f_auto,q_auto` · materialised KPI views · cursor pagination everywhere (never `offset` on big tables) · `select` only needed columns · Realtime instead of polling · route-level code-splitting · partial indexes on hot filtered queries.

---

## 8. v2 — LiveKit on a custom server *(deferred indefinitely)*

> **Status 2026-08-05: not planned.** At 200 students with 80–120 peak concurrent attendance, Google Meet on your existing Workspace covers the requirement. LiveKit would add ~₹3,000/month of VPS, a server to operate and monitor, and roughly two weeks of work — to solve a problem you do not have.
>
> **Revisit only if** a single class genuinely exceeds your Workspace participant cap, or you need in-class features Meet cannot provide (hand-raise-to-stage, polls, per-student breakout, embedded whiteboard).
>
> The seam is already built: `live_sessions.provider` and the single `get_live_join_url()` authorisation function mean adopting LiveKit later is a token-minting endpoint plus a dropdown value — not a rewrite. The design below is kept for that day.

### 8.1 Why, and what it changes
LiveKit gives real interactive classrooms: multi-publisher, hand-raise, stage promotion, polls, screen share, server-side recording, and no third-party participant caps. It replaces both Meet and YouTube Live once traffic justifies a VPS.

### 8.2 Topology

```
Students ──WebRTC──┐                    ┌── Egress ──► Cloudflare R2 (recordings, free egress)
Educator ──WebRTC──┤                    │
                   ▼                    │
        ┌────────────────────────┐      │
        │  VPS (Hetzner CPX41 /  │──────┘
        │  Contabo, 8 vCPU/16 GB)│
        │  ├ livekit-server (SFU)│
        │  ├ redis               │
        │  ├ coturn (TURN/443)   │  ← essential for students behind corporate/campus firewalls
        │  ├ livekit-ingress     │
        │  └ caddy (TLS)         │
        └───────────┬────────────┘
                    │ JWT minted by
                    ▼
        Next.js  POST /api/live/:id/token
```

Docker Compose on one box. Cost ≈ **€25–35/mo** (~₹2,500–3,200) plus bandwidth.

### 8.3 Token minting — the only new backend logic

```ts
// POST /api/live/:id/token   (called only after get_live_join_url() authorises)
import { AccessToken } from 'livekit-server-sdk';

const isEducator = session.educator_id === user.id;
const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
  identity: user.id,
  name: profile.full_name,
  metadata: JSON.stringify({ role: isEducator ? 'educator' : 'student', avatar: profile.avatar_url }),
  ttl: '2h',
});
at.addGrant({
  room: `session_${sessionId}`,
  roomJoin: true,
  canPublish:     isEducator,        // students are subscribers until promoted
  canSubscribe:   true,
  canPublishData: true,              // chat, hand-raise, polls
  roomAdmin:      isEducator,        // mute/remove participants
});
return { token: await at.toJwt(), url: process.env.LIVEKIT_WS_URL };
```
Reuse the **same authorisation function** as v1 — enrolment and time-window checks do not change.

### 8.4 The bandwidth reality (plan for this now)
Pure WebRTC fan-out does not scale linearly on one box: 1 publisher at 1.5 Mbps to **300** subscribers at 1 Mbps ≈ **300 Mbps sustained egress**. That is ~135 GB for a 60-minute class, and most VPS plans will throttle or bill you hard.

**Therefore, from day one of v2, split by interactivity:**
- **Interactive tier** (first ~50–100: those who can speak/ask) → WebRTC via LiveKit.
- **Broadcast tier** (everyone else) → **LiveKit Egress → HLS → CDN**. Adds ~10–20 s latency, costs almost nothing, scales to any number.
- Promote a student from broadcast to interactive on hand-raise (they re-join over WebRTC).

This hybrid is what every large ed-tech platform actually runs. Budgeting for pure WebRTC at 300+ is the single most common v2 mistake.

### 8.5 Migration, zero-downtime
1. Ship `provider='livekit'` support behind feature flag `live.livekit`.
2. Run one **internal test class** on LiveKit while all real classes stay on YouTube/Meet.
3. Move 1:1 mentorship first (2 participants — lowest risk).
4. Move one small batch class; watch join success rate, p95 join time, drop rate.
5. Flip the default. Keep Meet/YouTube as a per-session fallback **permanently** — when the VPS dies mid-class, the educator changes one dropdown and pastes a Meet link.

**Operational additions in v2:** VPS monitoring (Netdata/Prometheus), automated TLS renewal, `docker compose` deploy from CI over SSH, nightly recording sync to R2, TURN fallback verification from a mobile network, and a documented "SFU is down" runbook.

---

## 9. Runbook stubs to write during Phase 7

`docs/runbooks/` — payment webhook failing · Supabase paused/over quota · Drive quota exceeded mid-class · live session cannot start · deploy rollback · restore from backup · security incident (leaked key) · student data-erasure request.
