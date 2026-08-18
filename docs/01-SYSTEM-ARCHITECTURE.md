# FSP Platform — Part 1: System Architecture

Frontend · API · Backend logic · Storage · Drive/Live/Calendar mechanics · PWA

---

## 1. High-level architecture

```
                              ┌───────────────────────────────────┐
   Phone / Tablet / Desktop   │  FSP PWA  (Next.js 15 App Router) │
   installed to home screen   │  RSC pages + Client islands       │
                              │  Serwist service worker + cache   │
                              └───────┬───────────────┬───────────┘
                                      │               │
                    ┌─────────────────┘               └──────────────────┐
                    │ (A) direct, RLS-enforced                (B) privileged
                    ▼                                                     ▼
        ┌───────────────────────────┐                    ┌────────────────────────────┐
        │  Supabase                 │                    │  Next.js Route Handlers    │
        │  ├ Postgres + RLS         │◄───service role────┤  /api/*  (Node runtime)    │
        │  ├ Auth (Google/OTP/JWT)  │                    │  + Server Actions          │
        │  ├ Storage (private)      │                    │  + middleware (edge)       │
        │  ├ Realtime (WS)          │                    └──┬──────┬──────┬──────┬────┘
        │  └ pg_cron + pg_net       │                       │      │      │      │
        └──────────┬────────────────┘                       │      │      │      │
                   │ scheduled HTTP                         │      │      │      │
                   └────────────────────────────────────────┘      │      │      │
                                                                   │      │      │
        ┌───────────┬───────────┬───────────┬───────────┬───────────┘      │      │
        ▼           ▼           ▼           ▼                              ▼      ▼
   Cloudinary   Razorpay     Resend     Upstash                      Google Drive  YouTube
   (images)     (payments)   (email)    (rate limit)                 (video/PDF)   Live
                    │                                                              │
                    └──── webhook ────► /api/webhooks/razorpay              (embed) │
                                                                                   ▼
   Observability:  Sentry (errors) · Axiom (logs) · Better Stack (uptime)      v2: LiveKit
```

**Two data paths, deliberately:**

- **(A) Direct client → Supabase** for all *reads a user is allowed to make*. RLS is the authority. No API layer to write, no cold starts, Realtime for free.
- **(B) Client → Route Handler → Supabase (service role)** for anything that must not be trusted to the client: payments, webhooks, join-link issuance, email sends, Drive ingestion, admin mutations, anything touching money or another user's row.

The rule: **if the browser could lie about it, it goes through (B).**

---

## 2. Repository layout

```
WEBAPP/
├─ docs/                          # these documents
├─ FSP_Frontend_UI_Package/       # design reference (not deployed)
├─ supabase/
│  ├─ migrations/                 # timestamped SQL, the only way schema changes
│  ├─ functions/                  # Edge Functions (cron targets)
│  ├─ tests/                      # pgTAP — RLS assertions
│  └─ seed.sql
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/             # public landing, course catalogue, SEO
│  │  ├─ (auth)/                  # sign-in, OTP, callback
│  │  ├─ (student)/app/           # student portal
│  │  ├─ (educator)/studio/       # educator studio
│  │  ├─ (admin)/admin/
│  │  ├─ (support)/support/
│  │  ├─ (dev)/dev/
│  │  └─ api/                     # Route Handlers — see §4
│  ├─ components/
│  │  ├─ ui/                      # shadcn primitives, FSP-restyled
│  │  ├─ fsp/                     # KpiCard, Badge, DoubtCard, NotifCard, Toast…
│  │  ├─ calendar/                # MonthGrid, WeekStrip, AgendaList, SessionSheet
│  │  └─ player/                  # DrivePlayer, YouTubeLive, PdfViewer
│  ├─ features/                   # vertical slices: courses, live, doubts, quiz, payments…
│  │  └─ <feature>/{api,hooks,schema,components}
│  ├─ lib/
│  │  ├─ supabase/{client,server,admin,middleware}.ts
│  │  ├─ drive.ts                 # link parsing + embed builders
│  │  ├─ cloudinary.ts
│  │  ├─ razorpay.ts
│  │  ├─ resend.ts
│  │  ├─ ratelimit.ts
│  │  ├─ rbac.ts
│  │  └─ logger.ts
│  ├─ emails/                     # React Email templates
│  ├─ types/database.ts           # generated: supabase gen types
│  └─ middleware.ts
├─ e2e/                           # Playwright
├─ .github/workflows/
└─ public/{manifest.webmanifest,icons/,offline.html}
```

**Why feature slices:** `features/live/` holds its schema, queries, hooks and components together. Deleting or replacing live-class delivery in v2 touches one folder.

---

## 3. Frontend architecture

### 3.1 Design tokens — port, don't redesign

`style.css` `:root` maps 1:1 into Tailwind v4:

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-primary:             #7C3AED;
  --color-primary-hover:       #6D28D9;
  --color-primary-active:      #5B21B6;
  --color-primary-light:       #F3E8FF;
  --color-primary-ultra-light: #F9F5FF;
  --color-primary-border:      #E9D5FF;
  --color-primary-dark:        #3B0764;
  --color-primary-plum:        #451952;
  --color-primary-wine:        #662549;

  --color-success: #16A34A;  --color-success-bg: #DCFCE7;
  --color-error:   #DC2626;  --color-error-bg:   #FEE2E2;
  --color-warning: #D97706;  --color-warning-bg: #FEF3C7;
  --color-info:    #2563EB;  --color-info-bg:    #DBEAFE;

  --font-sans:    "Inter", ui-sans-serif, system-ui;
  --font-display: "Poppins", ui-sans-serif, system-ui;

  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --radius-xl: 20px; --radius-2xl: 24px;

  --shadow-purple: 0 10px 25px -5px rgb(124 58 237 / 0.15);
}
```

Fonts move from the CSS `@import` to `next/font/google` (self-hosted, no layout shift, no render-blocking request).

### 3.2 Responsive strategy (the F4 fix)

| Breakpoint | Navigation | Content |
|---|---|---|
| `< 768px` | Bottom tab bar (5 items) + hamburger drawer for the rest | Single column, `px-4`, cards stack, tables → card lists |
| `768–1024px` | Icon-only collapsed rail | Two columns where useful |
| `≥ 1024px` | Full 250px sidebar (today's design) | `max-w-[1240px]`, existing grids |

Concrete replacements for the current inline styles:
- `display:flex; height:100vh` shell → `flex min-h-[100dvh]` (`dvh` fixes mobile browser chrome).
- `grid-template-columns: 2fr 1fr` → `grid-cols-1 lg:grid-cols-[2fr_1fr]`.
- `.view-content { padding: 32px 48px }` → `px-4 py-6 md:px-8 lg:px-12 lg:py-8`.
- `.data-table` → a `<Table>` that renders `<DataCardList>` below `md`. Six-column tables are unusable on a phone.
- Safe areas: `pb-[env(safe-area-inset-bottom)]` on the bottom bar for iPhone.
- All tap targets ≥ 44×44 px.

### 3.3 Rendering strategy

| Surface | Mode | Reason |
|---|---|---|
| Landing, catalogue, course detail | **Static + ISR** (`revalidate: 300`) | SEO + cacheable, near-zero function cost |
| Dashboards | **RSC** with per-request Supabase session | Data-heavy, private, no client fetch waterfall |
| Player, calendar, chat, quiz runner | **Client Components** | Stateful/interactive |
| Notifications, live chat, attendee count | **Supabase Realtime** | Push, not poll |

State: server state in TanStack Query; UI state in React state/`nuqs` URL params. **No Redux.**

---

## 4. API surface

Only privileged operations get an endpoint. Everything else is direct-to-Supabase under RLS.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/otp/send` | public + RL 5/min/IP | Send phone OTP |
| `POST /api/auth/otp/verify` | public + RL 10/min/IP | Verify, issue session |
| `POST /api/drive/resolve` | educator/admin | Parse Drive URL → `{fileId, kind, title, thumbnailUrl}`, validate public access |
| `POST /api/media/sign-upload` | educator/admin | Cloudinary signed-upload params (secret never leaves server) |
| `POST /api/lessons/:id/progress` | student, enrolled | Mark opened/complete |
| `POST /api/resources/:id/download` | student, enrolled | Mint 60s signed Storage URL + audit row |
| **`POST /api/live/:id/join`** | student, enrolled | **Time-gated join link.** Core logic — §6.3 |
| `POST /api/live/:id/heartbeat` | student | Attendance ping every 60s |
| `POST /api/checkout/order` | authed + RL 10/min/user | Create Razorpay order, apply coupon server-side |
| `POST /api/webhooks/razorpay` | **signature only** | Payment events → enrol, email, ledger |
| `POST /api/admin/refund` | admin + step-up | Razorpay refund + audit |
| `POST /api/quiz/:id/submit` | student | **Server-side scoring** (answers never sent to client) |
| `POST /api/notifications/subscribe` | authed | Store Web Push subscription |
| `POST /api/cron/*` | `CRON_SECRET` header | Targets for `pg_cron` — reminders, digests, keep-alive, backup |
| `GET /api/health` | public | Uptime probe: DB ping, storage ping, build SHA |

**Conventions**
- Every handler: `zod.safeParse(body)` → rate-limit → authz → act → structured log → typed response.
- Errors: `{ error: { code: "AUTH_SESSION_EXPIRED", message, requestId } }`. The `code` feeds the existing `error-code-chip` UI directly.
- Every response carries `x-request-id`, propagated to Sentry and logs.
- All mutating routes are **idempotent by key** where money or email is involved.

---

## 5. Backend logic — the flows that matter

### 5.1 Enrolment via payment (money path)

```
Student → POST /api/checkout/order
   ├ re-price server-side (never trust client amount)
   ├ validate coupon: active, in-window, under max_uses, meets min_amount
   ├ insert orders(status='created')
   └ razorpay.orders.create() → return order_id to client
Client → Razorpay Checkout → user pays
Razorpay → POST /api/webhooks/razorpay
   ├ verify HMAC-SHA256 signature (raw body, timing-safe compare)  ── reject if bad
   ├ INSERT webhook_events(event_id) ON CONFLICT DO NOTHING  ── idempotency gate
   ├ if 0 rows inserted → already processed → 200 OK, stop
   ├ BEGIN
   │   update orders → 'paid'; insert payments
   │   insert enrollments(user, course, batch, expires_at)
   │   increment coupons.used_count
   │   insert notifications + audit_logs
   ├ COMMIT
   └ queue Resend invoice email (outside txn; failure ≠ lost enrolment)
```

Non-negotiables: verify signature **before parsing**, use the **raw body**, dedupe on Razorpay's event id, do the enrolment in **one transaction**, and always return 200 for events already seen. Also reconcile on client-return (`payment.captured` can arrive after the user is back) — the client calls `GET /api/orders/:id` which polls status.

### 5.2 Drive link ingestion (educator paste → student watch)

```
Educator pastes any Drive URL
   → POST /api/drive/resolve
       ├ parse file id (all 4 URL shapes — §6.1)
       ├ HEAD https://drive.google.com/file/d/{id}/preview
       │     404/403 → return DRIVE_NOT_PUBLIC with fix instructions
       ├ derive thumbnail https://drive.google.com/thumbnail?id={id}&sz=w1600
       ├ Cloudinary.upload(thumbnailUrl, folder:'fsp/lessons')  ← cached, resized, CDN
       └ return { fileId, kind, thumbnailPublicId }
   → insert lessons(drive_file_id, drive_kind, banner_public_id, …)
Student opens lesson
   → RLS confirms enrolment → returns drive_file_id
   → <DrivePlayer fileId> renders the /preview iframe
   → POST /api/lessons/:id/progress { status:'opened' }
```

The banner comes from Cloudinary, never hot-linked from Drive — Drive throttles and does not resize.

### 5.3 Notification fan-out

One event → up to three channels, per user preference:

```
domain event (doubt answered, class in 15m, payment ok, test published)
   → insert notifications(user_id, type, title, body, data)
   → Supabase Realtime pushes to open tabs      (bell badge, instant)
   → if prefs.push  → Web Push via VAPID        (device, works when closed)
   → if prefs.email → Resend template           (batched: instant for critical, digest otherwise)
```

`notification_prefs` is per-user × per-type. Critical types (class starting, payment failed) ignore digest batching.

---

## 6. The three mechanisms you specifically asked for

### 6.1 Google Drive link → banner + player

**Accepted input shapes** (`lib/drive.ts`):

```ts
const DRIVE_PATTERNS = [
  /drive\.google\.com\/file\/d\/([\w-]{25,})/,        // /file/d/{ID}/view?usp=sharing
  /drive\.google\.com\/open\?id=([\w-]{25,})/,        // /open?id={ID}
  /drive\.google\.com\/uc\?(?:export=\w+&)?id=([\w-]{25,})/,
  /docs\.google\.com\/\w+\/d\/([\w-]{25,})/,          // Docs/Slides/Sheets
  /drive\.google\.com\/drive\/folders\/([\w-]{25,})/, // folder → whole unit
];

export const embedUrl    = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
export const thumbnailUrl= (id: string, w = 1600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
export const folderEmbed = (id: string) => `https://drive.google.com/embeddedfolderview?id=${id}#grid`;
```

**Store the file ID, never the pasted URL.** URLs carry tracking params and change shape; the ID is stable and lets us switch rendering later.

**Player component**

```tsx
<iframe
  src={embedUrl(fileId)}
  allow="autoplay; encrypted-media; fullscreen"
  allowFullScreen
  loading="lazy"
  referrerPolicy="no-referrer"
  className="aspect-video w-full rounded-xl border-0"
/>
```
Same iframe renders PDFs — so notes and DPPs can use the identical component.

**Required Drive setup, and it must be in the educator UI as an inline hint:**
- Sharing = **"Anyone with the link" → Viewer**.
- In sharing settings, **uncheck "Viewers can download, print, copy"** — removes the obvious download button (does not stop screen recording).
- Keep course files in a **Shared Drive**, not a personal Drive, so quota and ownership survive staff changes.

**Known limits and mitigations**

| Limit | Effect | Mitigation |
|---|---|---|
| Per-file daily view quota | Hot lesson dies with "sharing limit exceeded" | Detect the error in the iframe wrapper → show fallback + alert admin; keep a `drive_file_mirrors` table with backup IDs on a second account; move top-10 lessons to YouTube unlisted |
| No playback events | No resume, no watch-time analytics | v1 = lesson-level progress (F3). UI shows completion %, not seconds |
| No DRM | Link sharing possible | Disable download; watermark PDFs with the student's email; cap concurrent sessions per account; audit unusual access |
| Iframe blocked on some in-app browsers | Blank player | Detect + offer "Open in Drive" deep link |

### 6.2 Live class calendar

**Data:** `live_sessions` (Part 2 §4). Times stored `timestamptz` (UTC), rendered `Asia/Kolkata`.

**Views** — mobile-first, no heavy calendar dependency (FullCalendar is ~200 KB and desktop-shaped):

1. **Agenda (mobile default)** — vertical list grouped by day, sticky day headers, infinite scroll forward, "Today" pill.
2. **Week strip** — 7 horizontal day chips with dot indicators; tap filters the agenda below.
3. **Month grid (desktop default)** — 7×6 grid, coloured dots per session, click day → side sheet.

Built with `date-fns` + `date-fns-tz` and CSS grid. ~8 KB total.

```tsx
// month grid skeleton
const days = eachDayOfInterval({
  start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
  end:   endOfWeek(endOfMonth(cursor),   { weekStartsOn: 1 }),
});
// group sessions by 'yyyy-MM-dd' in IST, then render 42 cells
```

**Session card states** drive the CTA and reuse the existing badge styles:

| `starts_at` relative to now | Badge | Primary action |
|---|---|---|
| > 24h | `badge-info` Upcoming | Add reminder / Add to my calendar (.ics) |
| 15m–24h | `badge-warning` Starting soon | Set reminder |
| −15m → `ends_at` | `badge-error` + pulse **LIVE** | **Join Class** (link now resolvable) |
| after `ends_at` | `badge-gray` Ended | Watch recording (Drive/YouTube) + Download material |

**No Google Calendar, by decision (2026-08-05).** The calendar is entirely ours: a recurrence engine generates sessions from a schedule template, and reminders go out through our own notification pipeline. This removes an OAuth scope request, a Google app-verification review, and a third-party dependency from the critical path. Full design in **Part 4 §3**.

### 6.3 Time-gated join link (the security-critical bit)

The Meet/YouTube URL must **never** be readable by a non-enrolled user, and must not leak before class. RLS is row-level, not column-level, so hiding one column needs a different tool: revoke the column and serve it from a `SECURITY DEFINER` function.

```sql
-- students may read the session row, but NOT the join_url column
revoke select (join_url) on public.live_sessions from authenticated;

create or replace function public.get_live_join_url(p_session uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_url text; v_start timestamptz; v_end timestamptz; v_course uuid;
begin
  select join_url, starts_at, ends_at, course_id
    into v_url, v_start, v_end, v_course
  from live_sessions where id = p_session;

  if v_url is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- must be enrolled and active
  if not exists (
    select 1 from enrollments e
    where e.user_id = auth.uid()
      and e.course_id = v_course
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'NOT_ENROLLED' using errcode = '42501';
  end if;

  -- window: 15 min before start → 30 min after end
  if now() < v_start - interval '15 minutes' then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;
  if now() > v_end + interval '30 minutes' then
    raise exception 'SESSION_ENDED' using errcode = 'P0001';
  end if;

  insert into session_attendance (session_id, user_id, joined_at)
  values (p_session, auth.uid(), now())
  on conflict (session_id, user_id) do update set last_seen_at = now();

  return v_url;
end $$;
```

`POST /api/live/:id/join` calls this RPC, maps the error codes onto your existing error-modal chips (`TOO_EARLY`, `NOT_ENROLLED`, `SESSION_ENDED`), rate-limits to 30/min/user, and returns `{ url, provider }`. Educators bypass the time window via a separate policy branch so they can open the room early.

---

### 6.4 The recording loop: Meet → Drive → lesson

Google Workspace (Business Standard and above) saves every Meet recording to the host's Drive automatically, in `My Drive/Meet Recordings/`. That output is *already* the exact input our content pipeline consumes — so a live class converts into a permanent recorded lesson with no re-upload, no transcoding and no storage cost.

```
Class ends on Meet
   → Workspace writes recording to Drive (a few min later)  [automatic]
   → Educator opens the ended session in Studio
   → "Publish recording" → pastes the Drive link
       ├ POST /api/drive/resolve       (same parser as §6.2)
       ├ live_sessions.recording_drive_id = fileId
       └ optional: create lessons(kind='video', drive_file_id=fileId)
                   inside the course module → appears in My Learning
   → Calendar card for that session flips to "Watch recording"
   → Absent students notified (notification type 'live.recording_ready')
```

Two upgrades worth doing later, both needing the Drive API and OAuth scopes (v1.5, not now):
- **Auto-discovery** — poll `Meet Recordings/` for files created within the session window and match by timestamp, so the educator pastes nothing at all.
- **Attendance import** — Business Plus emails an attendance CSV to the host after each meeting; parse it into `session_attendance` for exact per-student minutes, which is better data than our own heartbeat.

Until then the manual paste takes about ten seconds and requires zero extra permissions — a good trade for v1.

**Practical guardrails to surface in the Studio UI:**
- Recordings inherit the *organiser's* Drive quota. Workspace pooled storage is large but finite; a weekly 2-hour class at 1080p is roughly 2–3 GB/month. Move older recordings to a Shared Drive.
- Set the recording's sharing to **"Anyone with the link → Viewer, download disabled"**, same as any lesson (§6.1). Meet recordings default to organisation-only, which will show students a permission-denied screen — this is the single most likely support ticket, so the UI must check and warn on paste.
- Recordings count toward the same **per-file daily view quota** as any Drive file (§6.1). Popular recordings need the `drive_file_mirrors` fallback.

---

## 7. Storage strategy

| Asset | Home | Access control | Why |
|---|---|---|---|
| Course/lesson banners, avatars, product images | **Cloudinary** | Public, transformed URLs | Free transforms + CDN; keeps Supabase's 1 GB free |
| Lecture video | **Google Drive** (v1) | "Anyone with link", download off | Your requirement; zero storage cost |
| Large live broadcast | **YouTube Live** unlisted | Unlisted + embed-domain restriction | Infinite scale, free, auto-recorded |
| Notes / DPPs / question papers | **Supabase Storage**, private bucket | **60-second signed URLs**, per-download audit row | Must be revocable and traceable |
| Generated invoices | Supabase Storage, private | Signed URL, owner-only | Financial record |
| Recordings (v2) | **Cloudflare R2** | Signed HLS | R2 egress is free — the single biggest v2 cost saver |
| DB backups | R2 or Google Drive | Service-account only | Supabase free has no daily backups (F5) |

**Upload path (Cloudinary):** browser never sees the API secret. `POST /api/media/sign-upload` returns `{timestamp, signature, folder, publicId}`; the browser uploads directly to Cloudinary; the returned `public_id` is saved. Enforce `max_file_size`, allowed formats, and an `eager` transform for the banner size at upload time.

**PDF watermarking:** on first download, stamp the student's name + email + timestamp into the footer (pdf-lib in a Route Handler), cache the stamped copy per user for 24h. Deters redistribution and makes leaks traceable.

---

## 8. PWA specification

**Manifest** (`public/manifest.webmanifest`): `display: "standalone"`, `theme_color: "#7C3AED"`, `background_color: "#FAFAFB"`, `start_url: "/app?source=pwa"`, `orientation: "portrait-primary"`, icons at 192/384/512 (+ maskable), `shortcuts` for Live Classes / My Courses / Doubts, `screenshots` for the richer install prompt.

**Service worker (Serwist) caching:**

| Resource | Strategy |
|---|---|
| App shell, JS/CSS | Precache, revision-hashed |
| Cloudinary images | `CacheFirst`, 60 days, cap 200 entries |
| Fonts | `CacheFirst`, 1 year |
| Course/lesson JSON | `StaleWhileRevalidate`, 1 day |
| Downloaded PDFs | Explicit "Save offline" → **Cache Storage**, user-managed with a storage-usage meter |
| Auth, payments, join-link, any `POST` | **NetworkOnly** — never cached |
| Navigation fallback | `/offline.html`, FSP-branded |

**Offline capability matrix:** browse cached courses ✅ · read cached notes ✅ · take a downloaded quiz (queued via Background Sync) ✅ · watch video ❌ (Drive iframe needs network) · join live ❌ · pay ❌.

**Web Push:** VAPID keys, subscription stored per device in `push_subscriptions`, used for class-starting, doubt-answered and payment alerts. iOS requires the app be installed to the home screen first — the UI must say so.

**Install prompt:** capture `beforeinstallprompt`, show a branded bottom sheet after the user's second session (not on first load — it converts worse and annoys). iOS gets manual "Share → Add to Home Screen" instructions with a screenshot.

**Performance budget:** LCP < 2.5s on 4G, TBT < 200ms, initial JS < 180 KB gzip, Lighthouse PWA ≥ 90 — enforced in CI (Part 3 §6).

---

## 9. v1 → v2 seam for LiveKit

Everything live-class-related routes through **one function** (`get_live_join_url`) and **one column** (`live_sessions.provider`). To add LiveKit:

1. Add `'livekit'` to the provider enum.
2. In `POST /api/live/:id/join`, branch on provider: `meet`/`youtube` → return stored URL (today); `livekit` → mint a JWT with room = session id, identity = user id, grants by role.
3. Flip `provider` on one session behind a feature flag.

No schema migration for students, no UI rewrite, no downtime. Detail in Part 3 §8.
