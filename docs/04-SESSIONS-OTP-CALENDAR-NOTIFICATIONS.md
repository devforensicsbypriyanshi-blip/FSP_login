# FSP Platform — Part 4: Session Control, Email OTP, Own Calendar & Cross-Device Notifications

Added 2026-08-05 from your requirements: own calendar (no Google Calendar), all-device notifications, email OTP, one active session per account with auto-logout.

---

## 1. Single Active Session — the device lock

**Requirement:** one session at a time. A second login kicks the first device out. Idle or backgrounded sessions close themselves.

This is the standard anti-account-sharing control in Indian ed-tech (PW, Unacademy). Without it, one ₹4,999 enrolment gets shared across a WhatsApp group of thirty. It is worth building properly.

### 1.1 The hard constraint

Supabase access tokens are **stateless JWTs valid for their full 1-hour life**. Deleting a row or calling `signOut` does **not** invalidate a token already in a browser. So a database flag alone is not enforcement — it must be checked on the request path.

**Three layers, each covering the others' gap:**

| Layer | Latency | Purpose |
|---|---|---|
| **Realtime kick** | < 1 s | UX — the evicted device sees "signed out on another device" immediately |
| **Middleware check** | next request | **The actual enforcement.** Cannot be bypassed by ignoring the websocket |
| **Heartbeat** | ≤ 60 s | Catches idle tabs and updates `last_seen_at` for the admin device list |

### 1.2 Schema

```sql
create table user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  device_id     text not null,              -- client-generated UUID, persisted in localStorage
  device_label  text,                       -- "Chrome · Windows", "Safari · iPhone"
  user_agent    text,
  ip            inet,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  revoke_reason text check (revoke_reason in
                  ('new_login','idle_timeout','tab_closed','manual','admin','password_change')),
  unique (user_id, device_id)
);

create index idx_sessions_active on user_sessions (user_id) where revoked_at is null;
create index idx_sessions_stale  on user_sessions (last_seen_at) where revoked_at is null;

alter table user_sessions enable row level security;
create policy "see own sessions" on user_sessions for select
  using (user_id = auth.uid() or is_staff());
-- writes happen only through the RPC below / service role
```

### 1.3 Claim-and-evict (atomic)

```sql
create or replace function public.claim_session(
  p_device_id text, p_label text, p_user_agent text, p_ip inet
) returns table (session_id uuid, evicted_count int)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_evicted int;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;

  -- evict every other live device for this account
  update user_sessions
     set revoked_at = now(), revoke_reason = 'new_login'
   where user_id = v_user and device_id <> p_device_id and revoked_at is null;
  get diagnostics v_evicted = row_count;

  -- claim (or re-claim) this device
  insert into user_sessions (user_id, device_id, device_label, user_agent, ip)
  values (v_user, p_device_id, p_label, p_user_agent, p_ip)
  on conflict (user_id, device_id) do update
    set revoked_at = null, revoke_reason = null,
        last_seen_at = now(), ip = excluded.ip, user_agent = excluded.user_agent
  returning id into v_id;

  if v_evicted > 0 then
    insert into audit_logs (actor_id, action, entity_type, entity_id, after)
    values (v_user, 'SESSION_EVICT', 'user_sessions', v_id,
            jsonb_build_object('evicted', v_evicted, 'device', p_label));
  end if;

  return query select v_id, v_evicted;
end $$;
```

### 1.4 Middleware enforcement — without a DB hit per request

Checking Postgres on every navigation would be slow and would burn the free tier. Instead, cache the verdict in a **signed, httpOnly cookie** with a 60-second freshness window:

```
request → read session cookie (deviceId, sessionId, verifiedAt, hmac)
  ├ hmac invalid                      → force sign-out
  ├ verifiedAt < 60s ago              → PASS, no DB call        ← ~99% of requests
  └ verifiedAt stale                  → SELECT revoked_at, then re-stamp the cookie
       ├ revoked                      → clear cookies → /sign-in?reason=…
       └ live                         → PASS
```

Worst-case exposure after eviction is 60 seconds, and Realtime normally closes it in under one. Tune `SESSION_CHECK_TTL` down for admin routes (10 s) where the risk is higher.

**Reason codes** map onto the existing `error-code-chip` UI:
`SESSION_REVOKED_NEW_LOGIN` · `SESSION_IDLE_TIMEOUT` · `SESSION_ADMIN_REVOKED` · `SESSION_PASSWORD_CHANGED`

### 1.5 Client: instant kick via Realtime

```ts
supabase
  .channel(`session:${sessionId}`)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'user_sessions', filter: `id=eq.${sessionId}` },
      ({ new: row }) => {
        if (row.revoked_at) forceSignOut(row.revoke_reason);
      })
  .subscribe();
```

`forceSignOut` shows a blocking modal — *"You've been signed out. Your account was used on another device."* — with a Sign in again button, then `supabase.auth.signOut()` and a hard redirect. No silent kicks; an unexplained logout generates a support ticket.

### 1.6 Idle & visibility auto-logout

```
Activity events (throttled to 1 per 30 s): pointerdown, keydown, scroll, touchstart
  └─ reset idle timer

Idle timer fires at (IDLE_LIMIT − 60 s)
  └─ warning modal, 60 s countdown, "Stay signed in" → heartbeat + reset

Idle timer fires at IDLE_LIMIT
  └─ POST /api/session/end { reason: 'idle_timeout' } → signOut

document.visibilitychange → hidden
  └─ record hiddenAt; on return, if hidden > BACKGROUND_LIMIT → sign out

pagehide / beforeunload
  └─ navigator.sendBeacon('/api/session/end', { reason: 'tab_closed' })
     (best-effort — sendBeacon survives unload where fetch does not)

BroadcastChannel('fsp-session')
  └─ tabs on the SAME device share activity, so reading in tab B
     does not log you out of tab A
```

| Role | Idle limit | Background limit | Why |
|---|---|---|---|
| Student | 30 min | 15 min | Long lectures — must not log out mid-video |
| Educator | 60 min | 30 min | Teaching sessions run long |
| Support | 30 min | 15 min | Shared workstations |
| **Admin / Developer** | **15 min** | **5 min** | Highest blast radius |

**Two exemptions, or you will ship an infuriating bug:**
1. **During an active live class**, the idle timer pauses — a student watching a lecture generates no pointer events for 45 minutes and must not be ejected. Resume on session end.
2. **During a quiz attempt**, idle logout is disabled entirely; the quiz has its own server-side `expires_at` timer.

A server-side sweeper catches devices that vanished without a beacon:
```sql
select cron.schedule('reap-idle-sessions','*/5 * * * *', $$
  update user_sessions set revoked_at = now(), revoke_reason = 'idle_timeout'
  where revoked_at is null and last_seen_at < now() - interval '45 minutes';
$$);
```

### 1.7 Escape hatches (build these on day one)

Hard device locks generate support load. Without these, Support becomes the bottleneck:

- **"Sign out other devices"** button in student settings — self-serve, no ticket.
- **Device list** in profile: label, last seen, current-device marker, revoke button.
- **Cooldown**: max 5 device switches per 24 h. Beyond that → *"Too many devices. Contact support."* + a flag for the admin panel. This is the actual sharing signal.
- **Support override** in the Support dashboard: revoke all sessions for a user, audit-logged.
- **Trusted device grace**: re-login on a `device_id` seen in the last 30 days does not count toward the switch cooldown (same phone on wifi vs mobile data is not sharing).

---

## 2. Email OTP authentication

**Requirement:** email OTP. Wires directly into the existing 6-digit modal and `initOtpFields()`.

### 2.1 Critical setup step

Supabase's **built-in email service is rate-limited to roughly a handful of messages per hour** and sends from an unbranded address. It is unusable for real signups.

**You must configure custom SMTP with Resend** in Supabase → Auth → SMTP Settings before Phase 1 ships:
```
Host: smtp.resend.com   Port: 465   User: resend   Pass: <RESEND_API_KEY>
Sender: no-reply@forensicbypriyanshi.com   (domain DKIM+SPF verified in Resend)
```
Then raise the auth rate limits in Supabase → Auth → Rate Limits.

### 2.2 Six digits, not a magic link

Supabase's default email template sends a magic **link**. Your UI has a 6-digit code modal. Change the *Magic Link* template body to use the token:

```html
<h2>Your FSP verification code</h2>
<p style="font-size:32px;letter-spacing:8px;font-weight:700">{{ .Token }}</p>
<p>Valid for 10 minutes. If you didn't request this, ignore this email.</p>
```

```ts
// send
await supabase.auth.signInWithOtp({
  email,
  options: { shouldCreateUser: true, data: { source: 'web' } },
});

// verify — type 'email' returns a session directly
const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
```

### 2.3 Hardening

| Control | Value |
|---|---|
| Code length / lifetime | 6 digits, 10 minutes |
| Max verify attempts | 5, then the code is burned |
| Resend cooldown | 60 s, surfaced as the existing `Resend OTP (00:45)` countdown |
| Rate limit — send | 5 per 15 min per email **and** per IP |
| Rate limit — verify | 10 per 15 min per IP |
| Abuse escalation | hCaptcha after 3 failed verifies from one IP |
| Enumeration | Identical response and timing whether or not the email exists |
| Never | Log the code, put it in a URL, or return it in an API response |

> **Superseded by Part 5 (2026-08-05):** Google OAuth and phone OTP are both removed. **Email OTP is the only authentication method.** No password exists anywhere in the system, and no SMS provider is required. See Part 5 §1 and §2.1a.

---

## 3. Our own calendar — no Google Calendar

**Requirement:** our own calendar that auto-creates classes. Dropping the Google Calendar API also drops OAuth scope requests, an app-verification review, and a third-party outage from the critical path.

### 3.1 Recurrence: schedule template → generated sessions

Priyanshi defines a pattern once ("UGC NET Core — Mon/Wed/Fri, 4:00 PM, 90 min, until 30 Nov"), and the system materialises real `live_sessions` rows from it.

```sql
create table class_schedules (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references courses(id) on delete cascade,
  batch_id       uuid references batches(id),
  educator_id    uuid not null references profiles(id),
  title          text not null,
  description    text,
  weekdays       smallint[] not null,          -- ISO: 1=Mon … 7=Sun
  start_time     time not null,                -- local wall-clock in `timezone`
  duration_min   integer not null check (duration_min between 5 and 600),
  timezone       text not null default 'Asia/Kolkata',
  starts_on      date not null,
  ends_on        date,
  default_join_url text,                       -- reusable Meet room for the batch
  auto_generate  boolean not null default true,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint weekdays_valid check (
    weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(weekdays) > 0)
);

-- cancel or move a single occurrence without touching the pattern
create table schedule_exceptions (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references class_schedules(id) on delete cascade,
  occurrence_date date not null,
  action          text not null check (action in ('cancelled','rescheduled')),
  new_starts_at   timestamptz,
  reason          text,
  unique (schedule_id, occurrence_date)
);

-- link generated rows back to their pattern; the unique key makes generation idempotent
alter table live_sessions
  add column schedule_id     uuid references class_schedules(id) on delete set null,
  add column occurrence_date date,
  add constraint uq_schedule_occurrence unique (schedule_id, occurrence_date);
```

**Why a weekday array instead of full RFC-5545 RRULE:** weekly-by-weekday covers essentially every coaching timetable. Full RRULE (BYSETPOS, monthly-by-nth-weekday) is a large amount of edge-case code for a case you do not have. If it is ever needed, the column can be added without moving the generated rows.

### 3.2 The generator

`generate_date_series` walks the pattern day by day, converts local wall-clock to UTC through the schedule's timezone (so **IST DST-free today, still correct if you ever add another region**), and upserts:

```sql
create or replace function public.generate_sessions(p_schedule uuid, p_horizon_days int default 60)
returns integer language plpgsql security definer set search_path = public as $$
declare s class_schedules%rowtype; d date; v_start timestamptz; v_made int := 0;
begin
  select * into s from class_schedules where id = p_schedule and is_active and auto_generate;
  if not found then return 0; end if;

  for d in
    select gs::date from generate_series(
      greatest(s.starts_on, current_date),
      least(coalesce(s.ends_on, current_date + p_horizon_days), current_date + p_horizon_days),
      interval '1 day') gs
  loop
    continue when not (extract(isodow from d)::smallint = any(s.weekdays));
    continue when exists (select 1 from schedule_exceptions e
                          where e.schedule_id = s.id and e.occurrence_date = d
                            and e.action = 'cancelled');

    -- wall-clock in the schedule's zone → correct UTC instant
    v_start := (d + s.start_time) at time zone s.timezone;

    insert into live_sessions (course_id, batch_id, educator_id, title, description,
                               starts_at, ends_at, provider, join_url,
                               schedule_id, occurrence_date)
    values (s.course_id, s.batch_id, s.educator_id, s.title, s.description,
            v_start, v_start + make_interval(mins => s.duration_min),
            'meet', s.default_join_url, s.id, d)
    on conflict (schedule_id, occurrence_date) do nothing;   -- idempotent

    if found then v_made := v_made + 1; end if;
  end loop;
  return v_made;
end $$;

-- keep a rolling 60-day horizon populated
select cron.schedule('generate-sessions','0 3 * * *', $$
  select public.generate_sessions(id, 60) from class_schedules where is_active and auto_generate;
$$);
```

Editing a schedule regenerates only **future** occurrences — past sessions carry attendance and recordings and must never be rewritten.

### 3.3 Calendar UI (built in-house, ~8 KB)

`date-fns` + `date-fns-tz` + CSS grid. No FullCalendar (~200 KB, desktop-shaped, styling fights our tokens).

| Viewport | Default view | Components |
|---|---|---|
| Mobile | **Agenda** | Sticky month header, week strip of 7 tappable day chips with dots, grouped day sections, "Today" jump pill, pull-to-refresh |
| Tablet | Week | 7 columns × hour rows, current-time line |
| Desktop | **Month** | 7×6 grid, up to 3 session chips per cell + "+2 more", click day → right side sheet |

Shared: role-coloured chips, live pulse on in-progress sessions, `?d=2026-08-12` deep links (shareable, back-button correct), keyboard arrow navigation, `aria-label` per day cell.

**Educator scheduling UX:** "Create schedule" → title, course/batch, weekday toggle pills, time, duration, date range, Meet URL → **live preview listing the first 10 generated dates before saving.** People mis-set recurrence constantly; showing the actual dates prevents 40 wrong sessions.

**Reminders are ours, not Google's:** `pg_cron` at T-24h and T-15m → in-app + push + email (§4). No external calendar dependency anywhere.

---

## 4. Cross-device notifications

**Requirement:** notifications on all devices. Three channels off one event, respecting per-user preferences.

### 4.1 Fan-out

```
Domain event  (live.starting_15m · doubt.answered · payment.success ·
               quiz.published · recording.ready · session.evicted)
   │
   ├─► notifications row            → Realtime → bell badge on every OPEN tab   (instant)
   ├─► Web Push (VAPID)             → EVERY registered device, app closed       (~seconds)
   └─► Resend email                 → critical instantly, rest in a digest      (fallback)
```

Note: push subscriptions are **per device and independent of the session lock**. A student evicted from a device still gets class reminders there — that is correct, and it is what pulls them back to log in.

### 4.2 Device coverage — the honest matrix

| Platform | Web Push | Requirement |
|---|---|---|
| Android Chrome / Edge / Samsung | ✅ | Works on a plain tab |
| Desktop Chrome / Edge / Firefox | ✅ | Works, even with the browser closed on Windows |
| **iOS Safari 16.4+** | ⚠️ | **Only after "Add to Home Screen".** A plain Safari tab gets nothing |
| macOS Safari 16+ | ✅ | Works |
| Older iOS (< 16.4) | ❌ | Email is the only channel |

Roughly a third of Indian students are on iPhone, so the install step is not optional. The UI must: detect iOS + not-installed, show an illustrated "Share → Add to Home Screen" sheet, and **explain the benefit** ("get notified when class starts") rather than just asking for permission. Ask for the push permission only *after* they act on a notification-worthy thing — never on first load, which is the fastest way to a permanent "Block".

### 4.3 Implementation

```ts
// service worker — push + click routing
self.addEventListener('push', (event) => {
  const n = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(n.title, {
    body: n.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: n.tag,                 // same tag replaces, so 3 reminders ≠ 3 alerts
    renotify: n.critical,
    requireInteraction: n.critical,       // class-starting stays until dismissed
    data: { url: n.url },
    actions: n.actions,                   // [{action:'join', title:'Join Class'}]
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/app';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes(new URL(url, self.location.origin).pathname));
      return open ? open.focus() : clients.openWindow(url);
    })
  );
});
```

**Delivery hygiene:** on a `410 Gone` or `404` from the push service, delete the subscription row — dead endpoints otherwise accumulate forever and waste every send. Cap payloads at 4 KB. Re-subscribe on `pushsubscriptionchange`.

### 4.4 Preferences & quiet hours

`notification_prefs (user_id, type, in_app, push, email)` with sane defaults:

| Type | In-app | Push | Email | Quiet hours apply |
|---|---|---|---|---|
| `live.starting_15m` | ✅ | ✅ | ✅ | ❌ — class time is class time |
| `live.recording_ready` | ✅ | ✅ | ➖ digest | ✅ |
| `doubt.answered` | ✅ | ✅ | ✅ | ✅ |
| `quiz.published` | ✅ | ✅ | ➖ digest | ✅ |
| `payment.success` / `failed` | ✅ | ✅ | ✅ always | ❌ |
| `session.evicted` | ✅ | ➖ | ✅ | ❌ — security alert |
| `announcement` | ✅ | opt-in | ➖ digest | ✅ |

Quiet hours default 22:00–07:00 IST: non-critical notifications queue and release at 07:00. Digest emails batch daily at 19:00 IST, which also keeps you inside Resend's free 100/day ceiling far longer than per-event sending would.

---

## 5. Schema & roadmap deltas

**New tables:** `user_sessions`, `class_schedules`, `schedule_exceptions`
**Altered:** `live_sessions` + `schedule_id`, `occurrence_date`, unique `(schedule_id, occurrence_date)`
**New RPCs:** `claim_session`, `generate_sessions`
**New cron:** `reap-idle-sessions` (5 min), `generate-sessions` (daily 03:00)
**New endpoints:** `/api/session/claim` · `/api/session/heartbeat` · `/api/session/end` · `/api/session/revoke-others` · `/api/notifications/subscribe` · `/api/notifications/unsubscribe`

**Roadmap changes:**
- **Phase 1** grows: email OTP + Resend SMTP + the full session-lock system (+~4 days). It is auth-critical and cannot be retrofitted safely.
- **Phase 3** loses Google Calendar/.ics, gains the recurrence engine and generator (net ≈ neutral).
- **Phase 5** notification work moves partly into Phase 1, since `session.evicted` needs the notification pipeline on day one.
- **Razorpay KYC: ready ✅** — Phase 4 has no external blocker.
