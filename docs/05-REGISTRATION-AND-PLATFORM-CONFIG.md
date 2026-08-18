# FSP Platform — Part 5: Registration Flow & Runtime Platform Configuration

Added 2026-08-05. Supersedes the Google OAuth decision in Parts 0/3/4.

---

## 1. Decision: email + OTP only, no Google OAuth

**Google OAuth is removed from the platform.** Sign-in and registration both run on email + 6-digit OTP.

| What changes | Impact |
|---|---|
| Every `googleAuthModal` in the UI package | Replaced by the email/OTP modal. The Google account-picker mockups become dead design |
| `auth.users.raw_user_meta_data.avatar_url` | No Google profile picture — we generate initials avatars (`initials()` in `lib/utils.ts`) and allow an upload |
| Supabase Auth providers | Google provider disabled; only `email` enabled |
| CSP | `lh3.googleusercontent.com` can be dropped from `img-src` |
| Onboarding friction | Slightly higher (a code to fetch vs one tap) — offset by the fact that **no password ever exists**, so there is nothing to forget, leak, or reset |

**What this buys you:** no OAuth consent screen, no Google app-verification review, no dependency on a Google outage for login, and one authentication path to secure instead of two. Combined with dropping Google Calendar (Part 4 §3), the platform now has **zero Google API dependencies** — Drive and Meet are plain links, not integrations.

---

## 2. Registration flow

Registration and login are deliberately **different endpoints with different semantics**, because `shouldCreateUser` is the difference between "sign in" and "silently create an account for anyone who types an email".

```
REGISTER                                    LOGIN
  /register                                   /sign-in
     │                                           │
  ┌──▼─────────────────────┐               ┌─────▼──────────────────┐
  │ 1. Email               │               │ 1. Email               │
  │    + availability hint │               │                        │
  └──┬─────────────────────┘               └─────┬──────────────────┘
  ┌──▼─────────────────────┐                     │
  │ 2. Profile             │                     │
  │    full name (req)     │                     │
  │    exam target         │                     │
  │    referral (opt)      │                     │
  │    ☑ terms + privacy   │  ← DPDP consent,    │
  └──┬─────────────────────┘    timestamped      │
     │                                           │
  signInWithOtp({                          signInWithOtp({
    shouldCreateUser: TRUE,                  shouldCreateUser: FALSE,
    data: { full_name, ... }               })
  })                                             │
     └────────────────┬──────────────────────────┘
                      ▼
        ┌───────────────────────────────┐
        │ 3. 6-digit OTP                │  existing initOtpFields() modal
        │    auto-advance, paste-aware  │  60s resend cooldown
        └──────────────┬────────────────┘
                       ▼  verifyOtp({ type: 'email' })
        ┌───────────────────────────────┐
        │ 4. claim_session()            │  device lock — Part 4 §1
        └──────────────┬────────────────┘
                       ▼
        NEW USER → /onboarding → /app        RETURNING → /app (or ?next=)
```

### 2.1 Profile capture without a second round-trip

Supabase writes `options.data` into `raw_user_meta_data`, which the existing `handle_new_user` trigger already reads. So registration details land in `profiles` atomically at account creation — no "complete your profile" follow-up screen, no half-created accounts.

```ts
await supabase.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,
    data: {
      full_name: form.fullName,
      exam_target: form.examTarget,     // 'ugc_net' | 'msc' | 'other'
      referral_code: form.referral ?? null,
      consent_accepted_at: new Date().toISOString(),
      signup_source: 'web',
    },
  },
});
```

Extend `handle_new_user` (Part 2 §2) to copy `exam_target` and `consent_accepted_at` across, and to record the referral.

### 2.1a No phone number — anywhere in auth

**Decision (2026-08-05): email OTP is the only authentication factor. No phone number is collected at signup, and phone OTP is removed from the roadmap entirely.**

Consequences, all of them good:
- **No SMS provider.** MSG91/Twilio were the only non-free dependency in the auth path (~₹0.15/SMS). That line item is gone.
- **No DLT registration.** Indian SMS regulation requires TRAI DLT template registration for transactional SMS — weeks of paperwork, now avoided.
- **One factor to secure**, one delivery channel to monitor, one rate limit to tune.
- The Support dashboard's *"OTP & Account Helper"* mockup, which looks up SMS gateway delivery, becomes an **email delivery** lookup against the `email_log` table and Resend's delivery API. Same UI, better data — Resend gives real delivery/bounce/complaint events, which SMS gateways rarely do.

`profiles.phone` **stays in the schema as a nullable field**, but it is never touched by auth. It is collected **only at checkout for physical book shipping**, where a courier genuinely needs a contact number. Not at signup, not for login, not for OTP.

### 2.2 The enumeration trade-off — made configurable

`shouldCreateUser: false` makes Supabase return an error when the email has no account. That is **good UX** ("No account found — register instead?") and a **mild information leak** (an attacker can test which emails are enrolled).

Rather than hard-coding a choice, this is the flag `auth.strict_enumeration_protection`:

| Off (default) | On |
|---|---|
| Login with an unknown email → *"No account found. Create one?"* with a link | Always advances to the OTP screen and shows *"If an account exists, we've sent a code."* Verify fails generically |
| Register with a known email → *"Already registered. Sign in instead?"* | Generic message; OTP sent as a login |
| Better conversion | Better privacy |

Start Off — conversion matters more at launch. Flip it from the developer console if you ever see scripted probing.

### 2.3 Onboarding (new users only)

Three skippable steps, tracked by `profiles.onboarded_at`: pick exam target & target year → follow subjects of interest → enable notifications (**this is where the push permission is requested**, in context, not on first page load) plus the iOS "Add to Home Screen" prompt when applicable.

### 2.4 Hardening (unchanged from Part 4 §2.3)

6 digits · 10-minute TTL · 5 verify attempts then burned · 60s resend cooldown · 5 sends per 15 min per email **and** per IP · hCaptcha after 3 failures · identical response timing on both branches when strict mode is on · **the code is never logged, never in a URL, never in an API response.**

> **Still the #1 setup blocker:** Supabase's built-in auth email is throttled to a few messages per hour. Configure Resend SMTP (Part 4 §2.1) before Phase 1 ships or registration simply will not work.

---

## 3. Runtime platform configuration — "everything editable by the developer"

**Requirement:** every feature is behind a flag, and everything is editable from the developer console.

The design goal is that **changing platform behaviour never requires a deployment**. The counter-goal, equally important: a mis-click in that console must not be able to take the platform down.

### 3.1 Two stores, because flags and settings are different things

| | `feature_flags` | `app_settings` |
|---|---|---|
| Answers | *Is this feature on?* | *How does this feature behave?* |
| Value | boolean + targeting | typed value (int, string, enum, json, duration…) |
| Example | `live.chat_enabled` | `live.join_window_before_minutes = 15` |
| UI control | Toggle + rollout slider | Number input / select / colour picker, driven by its own validation schema |

Splitting them means the console can render the correct control and validate before saving, instead of offering a free-text box that lets someone set a timeout to `"fifteen"`.

### 3.2 Schema

```sql
create type setting_type as enum
  ('boolean','integer','number','string','text','enum','json','duration_minutes','color','url','email');

create table feature_flags (
  key              text primary key,           -- 'live.chat_enabled'
  name             text not null,
  description      text not null,              -- shown in the console; required
  category         text not null,              -- groups the console tabs
  enabled          boolean not null default false,
  default_enabled  boolean not null default false,
  rollout_percent  smallint not null default 100 check (rollout_percent between 0 and 100),
  target_roles     app_role[],                 -- null = everyone
  target_user_ids  uuid[],                     -- always-on allowlist, for internal testing
  is_protected     boolean not null default false,  -- admin + step-up re-auth required
  is_kill_switch   boolean not null default false,  -- admin only; developer cannot touch
  updated_by       uuid references profiles(id),
  updated_at       timestamptz not null default now()
);

create table app_settings (
  key            text primary key,             -- 'auth.otp_ttl_minutes'
  name           text not null,
  description    text not null,
  category       text not null,
  value          jsonb not null,
  default_value  jsonb not null,
  value_type     setting_type not null,
  validation     jsonb not null default '{}',  -- {min,max,step,options[],pattern,maxLength}
  unit           text,                         -- 'minutes','%','₹' — rendered as a suffix
  is_secret      boolean not null default false,
  is_protected   boolean not null default false,
  updated_by     uuid references profiles(id),
  updated_at     timestamptz not null default now()
);

-- every change, with a reason. Powers the diff view and one-click revert.
create table config_history (
  id          bigserial primary key,
  entity      text not null check (entity in ('flag','setting')),
  entity_key  text not null,
  before      jsonb,
  after       jsonb,
  reason      text,
  actor_id    uuid references profiles(id),
  actor_email text,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index idx_config_history_key on config_history (entity_key, created_at desc);

-- single row; bumped on any change so caches know to refetch
create table config_version (
  singleton  boolean primary key default true check (singleton),
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);
```

**Auto-versioning + auto-history via trigger** — so history can never be bypassed by writing directly to the table:

```sql
create or replace function public.track_config_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into config_history (entity, entity_key, before, after, actor_id, actor_email)
  values (tg_argv[0], coalesce(new.key, old.key), to_jsonb(old), to_jsonb(new),
          auth.uid(), (select email from profiles where id = auth.uid()));

  update config_version set version = version + 1, updated_at = now() where singleton;
  return new;
end $$;

create trigger trg_flag_history    after update on feature_flags
  for each row execute function public.track_config_change('flag');
create trigger trg_setting_history after update on app_settings
  for each row execute function public.track_config_change('setting');
```

**RLS:**
```sql
alter table feature_flags enable row level security;
alter table app_settings  enable row level security;
alter table config_history enable row level security;

-- everyone signed in can READ flags (the app needs them to render)
create policy "read flags"    on feature_flags for select using (auth.uid() is not null);
-- secrets are masked at the API layer, never selected raw by non-staff
create policy "read settings" on app_settings  for select using (auth.uid() is not null and not is_secret);
create policy "staff read all settings" on app_settings for select using (is_staff());

-- WRITES: developer for normal, admin for protected, admin only for kill switches
create policy "config write" on feature_flags for update using (
  case when is_kill_switch then has_role('admin')
       when is_protected   then has_role('admin')
       else has_role('developer') or has_role('admin') end
);
create policy "settings write" on app_settings for update using (
  case when is_protected then has_role('admin')
       else has_role('developer') or has_role('admin') end
);

create policy "staff read history" on config_history for select using (is_staff());
revoke update, delete on config_history from authenticated, anon, service_role;
```

> **Why developers cannot flip kill switches.** `payments.enabled` and `auth.email_otp_enabled` can take the business offline. A console that lets any developer toggle them at 2 a.m. is a liability, not a feature. Those two require the admin role plus step-up re-auth. Everything else — every ordinary feature — is fully developer-editable, which is what you asked for.

### 3.3 Resolution & caching

Reading two tables on every request would be slow and would burn the Supabase free tier. Serverless functions are ephemeral, so Realtime invalidation alone is unreliable — **TTL is the correct primitive**:

```ts
// lib/config.ts (server)
let cache: { config: PlatformConfig; version: bigint; fetchedAt: number } | null = null;
const TTL_MS = 30_000;

export async function getConfig(): Promise<PlatformConfig> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.config;   // ~99% of calls
  const config = await loadFromDb();          // 2 small indexed selects
  cache = { config, version: config.version, fetchedAt: Date.now() };
  return config;
}

export async function isEnabled(key: FlagKey, user?: { id: string; roles: string[] }) {
  const flag = (await getConfig()).flags[key];
  if (!flag?.enabled) return false;
  if (user && flag.targetUserIds?.includes(user.id)) return true;            // allowlist wins
  if (flag.targetRoles?.length && !flag.targetRoles.some((r) => user?.roles.includes(r))) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (!user) return false;
  return stableHash(`${key}:${user.id}`) % 100 < flag.rolloutPercent;        // sticky per user
}
```

`stableHash` keeps a given user on the **same side of a percentage rollout** across requests — otherwise a 50% rollout flickers features on and off as they navigate, which is worse than not shipping it.

**Propagation is ≤30 seconds, and the console says so explicitly** next to the save button. Clients receive config in the initial RSC payload and subscribe to `config_version` over Realtime for an immediate refresh of the open tab.

### 3.4 The developer console

`/dev/config` — grouped by category, matching the existing Feature Flags tab in `developer_dashboard.html`:

- **Search + category tabs** (Auth · Live · Content · Payments · Quiz · Doubts · Notifications · UI · Ops)
- Each row: name, description, current value, control, `Modified` chip when ≠ default, and **Reset to default**
- **Protected rows** carry a lock icon and open a step-up re-auth dialog requiring a typed reason
- **Kill switches** are red-bordered, admin-only, and require typing the flag name to confirm
- **History drawer** per key: who, when, before → after, reason, one-click **Revert**
- **Diff-before-save** — nothing is written until the change is reviewed
- **Global "Reset all to defaults"** — admin only, the break-glass button

Three safety features worth building even though they cost a day:
1. **Temporary changes** — "enable for 2 hours, then auto-revert", implemented as a `revert_at` column plus a `pg_cron` sweep. Turns risky experiments into safe ones.
2. **Validation on write** — a Postgres `check_setting_value(key, value)` function enforcing the `validation` JSON, so a bad value cannot enter the table even via direct SQL.
3. **Config export/import** as JSON, so staging and production can be diffed and aligned.

### 3.5 Flag registry — the "all features are flagged" inventory

Seeded in the first migration. `🔒` protected (admin + step-up), `☠️` kill switch (admin only).

| Category | Key | Default | Controls |
|---|---|---|---|
| **Ops** | `ops.maintenance_mode` ☠️ | off | Whole platform → maintenance page; staff bypass |
| | `ops.read_only_mode` 🔒 | off | Blocks all writes; reads keep working |
| | `ops.registration_open` 🔒 | on | Master switch for new signups |
| | `ops.debug_logging` | off | Verbose structured logs |
| **Auth** | `auth.email_otp_enabled` ☠️ | on | The only login method — hence a kill switch |
| | `auth.strict_enumeration_protection` | off | §2.2 |
| | `auth.single_device_session` 🔒 | on | The device lock (Part 4 §1) |
| | `auth.idle_logout_enabled` | on | Idle auto-logout |
| | `auth.captcha_enabled` | off | hCaptcha on OTP send |
| **Live** | `live.enabled` | on | Live classes module |
| | `live.chat_enabled` | on | In-class chat |
| | `live.chat_slow_mode` | off | Rate-limits student messages |
| | `live.attendance_tracking` | on | Heartbeat attendance |
| | `live.recording_publish` | on | "Publish recording" in Studio |
| | `live.auto_generate_sessions` | on | Recurrence engine (Part 4 §3) |
| **Content** | `content.drive_player` | on | Drive iframe player |
| | `content.downloads_enabled` | on | Note/DPP downloads |
| | `content.pdf_watermark` | on | Per-student watermarking |
| | `content.free_previews` | on | `is_preview` lessons visible to non-enrolled |
| **Payments** | `payments.enabled` ☠️ | off | Master payment switch — off until launch |
| | `payments.coupons_enabled` | on | Coupon engine |
| | `payments.emi_enabled` | off | Razorpay EMI |
| | `payments.self_serve_refund` 🔒 | off | Student-initiated refunds |
| **Quiz** | `quiz.enabled` | on | Quiz module |
| | `quiz.negative_marking` | on | Negative marks |
| | `quiz.review_after_submit` | on | Show answers post-submit |
| | `quiz.leaderboard` | off | Public rankings |
| **Doubts** | `doubts.enabled` | on | Doubts forum |
| | `doubts.anonymous_posting` | off | Post without a name |
| | `doubts.attachments` | on | Image uploads |
| | `doubts.ai_assist` | off | AI draft answer before educator verification |
| **Notify** | `notifications.push_enabled` | on | Web Push |
| | `notifications.email_enabled` | on | Resend email |
| | `notifications.quiet_hours` | on | 22:00–07:00 IST suppression |
| **UI** | `ui.store_tab` | on | Store & Books |
| | `ui.mentorship_tab` | on | 1:1 Mentorship |
| | `ui.announcement_banner` | off | Sitewide banner |
| | `ui.dark_mode` | off | Dark theme |

### 3.6 Settings registry

| Category | Key | Type | Default | Range |
|---|---|---|---|---|
| Auth | `auth.otp_length` | integer | 6 | 4–8 |
| | `auth.otp_ttl_minutes` | duration | 10 | 1–60 |
| | `auth.otp_max_attempts` | integer | 5 | 3–10 |
| | `auth.otp_resend_cooldown_seconds` | integer | 60 | 30–300 |
| | `auth.idle_minutes_student` | duration | 30 | 5–180 |
| | `auth.idle_minutes_admin` | duration | 15 | 5–60 |
| | `auth.device_switch_limit_24h` | integer | 5 | 1–20 |
| | `auth.trusted_device_days` | integer | 30 | 1–365 |
| Live | `live.join_window_before_minutes` | duration | 15 | 0–120 |
| | `live.join_window_after_minutes` | duration | 30 | 0–180 |
| | `live.reminder_offsets_minutes` | json | `[1440, 15]` | array |
| | `live.generation_horizon_days` | integer | 60 | 7–365 |
| | `live.default_provider` | enum | `meet` | meet\|youtube\|livekit |
| Content | `content.signed_url_ttl_seconds` | integer | 60 | 15–3600 |
| | `content.drive_thumbnail_width` | integer | 1600 | 400–2400 |
| Payments | `payments.gst_percent` | number | 18 | 0–28 |
| | `payments.refund_window_days` | integer | 7 | 0–90 |
| | `payments.invoice_prefix` | string | `FSP` | ≤8 chars |
| Quiz | `quiz.autosave_seconds` | integer | 15 | 5–60 |
| Doubts | `doubts.per_hour_limit` | integer | 10 | 1–100 |
| Notify | `notifications.quiet_start` | string | `22:00` | HH:MM |
| | `notifications.digest_hour` | integer | 19 | 0–23 |
| UI | `ui.announcement_banner_text` | text | `""` | ≤280 chars |
| | `ui.support_whatsapp` | string | — | E.164 |
| | `ui.support_email` | email | — | — |

### 3.7 Using flags in code

```tsx
// Server Component — no client JS cost
const showStore = await isEnabled('ui.store_tab', user);
{showStore && <StoreTab />}

// Client Component — config arrives via a provider seeded by RSC
const { flag, setting } = usePlatformConfig();
if (!flag('doubts.attachments')) return null;
const cooldown = setting('auth.otp_resend_cooldown_seconds'); // typed: number

// API route — fail closed
if (!(await isEnabled('payments.enabled'))) {
  return apiError('FEATURE_DISABLED', 'Payments are temporarily unavailable', 503);
}
```

**Rule: flags fail closed.** If config cannot be loaded, `isEnabled` returns the **default**, not `true`. A database blip must not silently enable an unfinished feature. Kill switches specifically default to their safe position.

**Rule: flags are not permissions.** A flag decides whether a feature exists; RLS decides who may touch its data. Never gate access control on a flag — someone will eventually flip it.

---

## 4. Deltas to earlier parts

**Superseded:** Google OAuth in Part 0 §3, Part 3 §1, Part 4 §2 — email OTP is now the only method.

**New tables:** `feature_flags` (expanded), `app_settings`, `config_history`, `config_version`
**New RPCs:** `check_setting_value`, `revert_config`
**New cron:** `config-auto-revert` (every 5 min, honours `revert_at`)
**New routes:** `/register`, `/onboarding`, `/dev/config`
**New endpoints:** `/api/config` (cached read) · `/api/dev/config` (write, permission-checked) · `/api/dev/config/revert`

**Roadmap impact:**
- **Phase 1** absorbs registration + onboarding + the config system. The config system must land in Phase 1, not later — retrofitting flags into shipped features costs several times more than building them flagged. Phase 1 is now ~2 weeks, not 1.
- **Phase 6** developer console shrinks to *rendering* the config UI, since the engine already exists.
- CSP can drop `lh3.googleusercontent.com`; Supabase Auth enables the `email` provider only.
