# Page inventory & decision log

_Every route, why it exists, what protects it, and what happens if that protection is wrong._

This is the file to read before adding a page. The **Guarded by** column is the important one: it names the mechanism that actually stops the wrong person seeing the page, which is never the UI.

---

## How access is decided

Three layers, in order. Each is a different question.

| Layer | Question | Wrong answer costs |
|---|---|---|
| **Middleware** | Are you signed in, on your one allowed device, holding a permitted role for this URL prefix? | A stranger sees the shape of the admin console |
| **RLS** | Which rows may you read or write? | A student reads another student's data |
| **SECURITY DEFINER functions** | May you perform this specific action? | A student enrols themselves for free |

**Middleware is the front door, not the lock.** Turning it off would expose navigation, not data — RLS still returns nothing. That separation is deliberate: it means a routing bug is embarrassing rather than a breach.

---

## Public — no session

Reachable while signed out, because a payment processor and a first-time visitor both need them.

| Route | Purpose | Guarded by |
|---|---|---|
| `/` | Redirects to `/sign-in` | — |
| `/sign-in` | Email → OTP | Supabase Auth rate limits |
| `/register` | Create account | `shouldCreateUser: true`, consent required |
| `/sign-out` | Confirm, revoke session | POST only — a GET would let another site sign you out |
| `/terms`, `/privacy`, `/refund-policy`, `/contact` | Legal | Public **by requirement** — Razorpay checks them |
| `/403`, `/_not-found` | Refusal and dead links | — |

> `/` redirects rather than showing a landing page: the marketing site lives on the apex domain, this is the app.

---

## Student — `/app`

| Route | Purpose | Guarded by |
|---|---|---|
| `/app` | Home: live now, resume, announcements | middleware + RLS |
| `/app/learning` | Enrolled courses | `enrollments: read own or staff` |
| `/app/learning/[id]` | Course player | `lessons: preview, enrolled, owner or staff` |
| `/app/live` | Classroom, upcoming, recordings, own attendance | `sessions: enrolled, educator or staff` |
| `/app/live/[id]` | One class + recording | same |
| `/app/calendar` | Month, week, agenda | same |
| `/app/tests` | Quiz list | `quizzes: published to enrolled` |
| `/app/tests/attempt/[id]` | Runner **and** review | `get_quiz_paper` / `get_quiz_review` |
| `/app/notes`, `/app/notes/[id]` | Study material | `resources: free or enrolled` |
| `/app/doubts` | Forum | `doubts: readable to course members` |
| `/app/store` | Catalogue | `courses: published are public` |
| `/app/orders`, `/app/orders/[id]` | Receipts | `orders: read own or staff` |
| `/app/notifications` | Inbox | `notifications: own only` |
| `/app/mentorship` | Book a 1:1, see your sessions | `book_slot()` — atomic claim, 15-min hold |

**Why the quiz runner and review share one URL:** the redirect after submitting lands on the page you were already on, and a bookmarked attempt always resolves to something sensible. `get_quiz_review` refuses until the attempt is submitted, so the page cannot leak an answer key by being opened early.

---

## Shared account pages

One set, not one per portal — a person has one profile, not one per role they hold. The portal shell still adapts to whoever is signed in.

| Route | Purpose | Guarded by |
|---|---|---|
| `/account` | Profile. Email is read-only | `profiles: update own` |
| `/account/settings` | Notification prefs, **device list** | `sessions: read own or staff` |
| `/search` | Courses, lessons, classes | RLS filters results |
| `/onboarding` | Three skippable steps | redirects if already done |
| `/portal` | Role → correct portal | `pickPrimaryRole` |

**Email is deliberately not editable.** It is the login credential and there is no password to fall back on, so a typo would lock someone out permanently. Changing it is an auth flow needing verification on both addresses.

---

## Educator — `/studio`

Roles: `educator`, `admin`.

| Route | Purpose | Guarded by |
|---|---|---|
| `/studio` | Overview | middleware |
| `/studio/courses`, `/studio/courses/[id]` | Lessons, Drive links | `courses: educator manages own` |
| `/studio/schedule` | Recurring classes | `publish_schedule()` checks ownership |
| `/studio/live` | Recordings, move, cancel | `set_session_recording`, `reschedule_occurrence` |
| `/studio/live/[id]` | Class register: joins, devices, absentees | `get_session_attendance()` — own class or staff |
| `/studio/analytics` | Engagement | RLS |
| `/studio/doubts` | Answer with the verified badge | `answer_doubt()`, `set_doubt_status()` |
| `/studio/quizzes`, `/studio/quizzes/[id]` | Build and publish papers | `upsert_quiz`, `upsert_question`, `set_quiz_status` |
| `/studio/broadcasts` | Announce to a course | `send_broadcast()` → `enqueue_for_course()` |
| `/studio/notes` | Study material: write, attach, link | `upsert_resource`, `set_resource_published` |
| `/studio/mentorship` | Publish availability, attach the Meet link | `create_slots`, `set_booking_meet_url` |

**Quiz authoring writes through functions, never the table.** `quiz_questions` and `quiz_options` have a SELECT policy and *no write policy at all* — RLS denies every insert by default. That is deliberate: there is one code path to audit rather than a policy per verb, and it is the same path that enforces "exactly one correct answer".

Publishing is refused if any question has fewer than two options or anything other than one correct answer. Zero correct makes a question unscoreable, two makes it unfair, and neither is noticed until results are published. The refusal carries the count, so the educator is told *how many* questions still need work.

Published papers are read-only in the builder. Editing a paper students are already sitting changes their marks under them.

---

## Admin — `/admin` · Support — `/support` · Developer — `/dev`

| Route | Purpose | Guarded by |
|---|---|---|
| `/admin` | Counted platform stats | admin only |
| `/admin/enrollments` | **Manual enrolment** | `grant_course_access()` — admin, reason ≥10 chars |
| `/admin/transactions` | Orders, stuck payments | `orders: read own or staff` |
| `/admin/emails` | Per-key quota, suppressions | staff |
| `/admin/settings` | Pricing, hours, policy | `settings: write by role` |
| `/admin/users` | Role assignment | `set_user_roles()` — admin, with lockout guards |
| `/admin/audit` | Every privileged action | `get_audit_logs()` — staff; table is append-only |
| `/admin/coupons` | Discount codes | `upsert_coupon`, `set_coupon_active` — admin |
| `/admin/approvals` | Publish or send back a course | `set_course_status()` — admin, reason required |
| `/support`, `/support/[id]` | Ticket queue and thread | `tickets: own or staff` |
| `/support/accounts` | "I didn't get my code" | `email_log: staff read` |
| `/dev/config` | Feature flags | `flags: write by role` |
| `/dev/keys` | Integration status, email quota | staff · presence only, never values |
| `/dev/logs` | Failed emails, notifications, webhooks | `get_recent_failures()` — staff |
| `/dev/webhooks` | Inbound deliveries, dedupe evidence | `get_webhook_events()` — staff, payloads excluded |

**Enrolments is the most important admin screen at launch.** Payments ship disabled, so granting access by hand is the only way a student gets into a course.

**Support can never see a sign-in code.** Not stored here, not retrievable from Supabase, and an agent who could read them is an account-takeover path.

**Two lockout guards on role changes.** You cannot remove your own admin role, and the last admin cannot be demoted by anyone. Both are permanent lockouts otherwise — granting a role requires admin, so there is no way back in. The error messages explain *why*, because an admin who does not understand the refusal will try again from another account and hit the same wall.

**Coupons are disabled, never deleted.** An order that used one refers to it, and a paid order whose discount cannot be explained is exactly the record you need during a refund dispute. `used_count` is displayed and never editable — an editable record is not one.

**`/dev/keys` is not a key manager, deliberately.** The mock-up had "Generate key" and Revoke buttons. This platform has no API-key system, and adding one to fill a screen would mean inventing a second authentication path — with its own storage, rotation and revocation to get wrong — that nothing needs. It reports *presence*: which integrations are configured and how much quota is left. A console that can display a secret leaks one the first time someone screen-shares it.

The status column names the **effect**, not the variable. "RAZORPAY_KEY_SECRET missing" means nothing at 2am; "students cannot pay" does.

**`/dev/logs` is not an HTTP request log.** Vercel keeps those with better detail and retention than a Postgres table could, and producing one here would mean writing every request to the database. This covers what Vercel cannot see: which email bounced, which notification exhausted its retries, which webhook was rejected.

**No "send test payload" button on `/dev/webhooks`.** A test payload must be signed with the real secret to reach the handler — so the button either skips verification and proves nothing, or asks the server to sign arbitrary input with the production secret. Both are worse than testing from the provider's dashboard. Payloads are not displayed either: Razorpay's contain the payer's contact details.

**Every admin write logs itself in the same transaction as the change.** Not afterwards, and not from the application. A log written by a second call is a log that is missing precisely when an operation failed halfway through. `audit_logs` has UPDATE and DELETE revoked from `authenticated` and `anon`: an audit trail the audited can edit is decoration.

---

## Server routes — every external link goes through one

This is the rule the platform is built around: **no third-party URL that implies access is ever rendered into a page.**

| Route | Returns | Why it is a route and not a link |
|---|---|---|
| `/api/media/[kind]/[id]` | 307 → Drive | The file id would otherwise sit in view-source, shareable forever |
| `/api/live/[id]/join` | Meet URL | `join_url` is column-REVOKEd; only `join_live_session()` can read it, and it checks enrolment **and** the T-15m→T+30m window before recording the join |
| `/api/resource/[id]/open` | External URL | `external_url` is column-REVOKEd; `log_resource_view()` writes the log line **before** returning it, so there is no unlogged path to the link |
| `/api/mentorship/[id]/join` | 1:1 Meet URL | `meet_url` is column-REVOKEd; issued only to the two people on the booking, only inside the window |
| `/api/checkout` | Razorpay order | The browser sends course **ids**; the server prices them |
| `/api/session/claim` | Device lock | Evicts other sessions in one transaction |
| `/api/session/heartbeat` | Still active? | Tells an evicted tab within a minute |
| `/api/session/end` | Sign out | Revokes the row **before** dropping the token — the other order leaves `auth.uid()` null and the row survives |
| `/api/push/register` | Store FCM token | RLS refuses a token filed against another user |
| `/api/webhooks/razorpay` | Grants access | Signature verified **before** parsing; replay-safe |
| `/api/webhooks/resend` | Delivery events | Tries each configured secret |
| `/api/webhooks/ses` | Bounces via SNS | Certificate host, **then** signature, **then** topic ARN — all three |
| `/api/cron/notifications` | Drains the queue | `CRON_SECRET`, fails closed |

### Google Meet — the flow in full

1. Educator saves a Meet link on the schedule. It is written to `live_sessions.join_url`.
2. That column is `REVOKE`d from `authenticated`, so **`select *` on the table fails outright** for students. Not filtered — fails.
3. Student clicks Join → `POST /api/live/[id]/join`.
4. `join_live_session()` checks active enrolment, checks the time window, records the join, returns the URL.
5. The browser opens it in a tab that was created **synchronously on the click**, because a `window.open` after an await is blocked as a popup.

POST, not GET: it writes the attendance row, and a GET would be prefetched — marking students present for classes they never opened.

The credential is never shared. It is not in the page, not in the RSC payload, not in the client bundle, and not in a link anyone can forward — a student who has never been enrolled cannot obtain it at all.

### Attendance — what the two numbers mean

`join_live_session()` records more than "was here". Per student per class it keeps **join count**, **first joined**, **last seen**, **last IP**, and the **set of device ids**.

| Signal | Reads as | Why it is not proof |
|---|---|---|
| High join count | Reconnected several times | Indian mobile data drops; three joins in a minute is one bad tunnel, not three people |
| High **device** count | Several distinct browsers | A student legitimately uses a phone and a laptop. Five is different |

Both are shown to the educator, and no verdict is. `/studio/live/[id]` lists the **whole roster** — absentees included, because "who is missing" is the question that screen exists to answer.

Device ids are unioned, not appended, so rejoining from one device does not inflate the count and make an honest student look like a shared account.

> **`get_live_join_url()` is now revoked from `authenticated`.** It still worked, still checked enrolment — and PostgREST exposes every granted function at `/rest/v1/rpc/<name>`, so anyone who did not want to be counted could call it directly and get the same URL with no join count and no device id. Not a data leak; worse in a quieter way, because it made the register wrong for exactly the accounts worth watching.

### Study material — three formats, one rule

| Format | What it is | How it is protected |
|---|---|---|
| `text` | Markdown written or pasted in the studio | Rendered in-app, watermarked, every open logged |
| `drive` | An existing PDF | Watermarked viewer, file id never in the page |
| `link` | Slides, a dataset, anything external | URL column-REVOKEd, issued only by `log_resource_view()` |

**What is stored is Markdown, never HTML.** This is the security decision, not a formatting preference. Sanitising pasted HTML means maintaining a denylist against every parser quirk and mutation-XSS trick ever found; get it wrong once and an educator account becomes stored XSS against every student. `renderNote()` escapes the entire input first and then emits a fixed, closed set of tags — the allowlist is the shape of the code rather than a list to keep updating. `markdown.test.ts` asserts that no tag outside that set can be produced from any input.

**Paste is cleaned, not just accepted.** PDF text extraction has no concept of a paragraph: one line per *rendered* line, words hyphenated across them, page numbers interleaved. Pasted raw, a chapter arrives as several hundred one-line paragraphs. `cleanPastedText()` rejoins wrapped lines, repairs hyphen splits and drops page furniture — but only where it is unambiguous. A line ending in a full stop is left alone, because that is probably a real break.

### On "DRM"

There is none. Not here, not anywhere on the web. A browser cannot stop a screenshot, a phone camera, or devtools, and any product claiming otherwise is describing a speed bump.

What this platform actually does:

| | |
|---|---|
| **Does** | Watermarks every reading with the reader's name and email. Logs every open with device and IP. Keeps file ids and external URLs out of page source. Forces the watermark to survive "print to PDF" (`print-color-adjust: exact`, or the browser helpfully strips it). |
| **Does not** | Prevent a copy. Ever. |

The honest description is **deter and trace**: the easy paths all carry a name, so a leaked page identifies the account it came from.

### Media — what it does and does not achieve

| | |
|---|---|
| **Does** | Keeps Drive ids out of page source and RSC payloads. Requires a live enrolled session per view. One log line per open. |
| **Does not** | Make the URL unobtainable — the browser must fetch it, so it is visible in devtools. |

Same deter-and-trace posture as the watermark. It raises the effort from *view source* to *understand devtools*, which is the honest size of the win. No web platform can stop a screen recording either.

---

## Mentorship — the two-students-one-slot problem

The hard part of booking is not the form. It is that two students tapping the same slot within the same second must produce **one booking and one clear refusal** — never two bookings, and never a slot held by nobody.

**The claim is a single guarded UPDATE.**

```sql
update public.mentorship_slots
   set is_booked = true, reserved_until = v_hold
 where id = p_slot and not is_booked;
```

One row or zero. Postgres serialises the two writers and the loser sees `not found`. Reading first and then writing would leave a window between the two statements; there is none here.

**A paid slot is held, not booked.** Fifteen minutes, then it returns to sale. Expired holds are released *lazily* — `release_expired_slot_holds()` runs at the top of the only two functions that can see or take a slot, so a stale hold cannot be observed without first being cleared. No cron, nothing to forget to schedule, and no drift.

**One open hold per student.** Without it, tapping Book on six slots and paying for none holds an educator's whole week hostage for a quarter of an hour.

**Confirmation follows the webhook,** exactly like enrolment: `fulfil_order()` calls `confirm_mentorship_for_order()`. The browser's success handler is JavaScript on the buyer's machine and can be called from a console.

**A cancelled booking puts the slot back on sale.** It is somebody's paid working hour; leaving it dark loses money for no reason.

---

## Decisions worth not re-litigating

**Login is mandatory, and demo mode is opt-in.** It used to be opt-out — open unless a variable said otherwise. Forgetting that variable on one deployment would have shipped every portal wide open. It now fails closed.

**Route guards are env-driven, not a database flag.** Every product feature is a runtime flag, but a kill switch that can disable authentication is not a product feature: one bad row would open every portal.

**Progress is lesson-level, permanently in v1.** The Drive iframe is cross-origin and emits no playback events, so watch time is unobtainable. Hence an explicit "Mark complete" button rather than an inferred percentage — a number we cannot measure should not be displayed as if we had.

**Auth email always sends, even over budget.** Locking a student out of the platform to protect a soft quota is the wrong trade, and it would be one made silently.

**Enrolment follows the webhook, never the browser.** Razorpay's success handler is JavaScript on the buyer's machine and can be called from a console.

---

## The bug class this codebase has hit six times

**A policy that names a condition in one place and omits it in another.**

```sql
for all using (educator_id = auth.uid() and public.has_role('educator'))
     with check (educator_id = auth.uid());          -- role check missing
```

For INSERT, Postgres consults `WITH CHECK` **only**. Found on `live_sessions`, `courses`, `quizzes` and `mentorship_slots` — each let any signed-in student create content attributed to themselves. A variant on `doubt_answers` let anyone read every answer to every doubt by checking the parent *existed* rather than that it was *visible*.

Run after any migration touching policies:

```sql
select * from public.audit_policy_asymmetry();
```

> **Feature flags do not mitigate this.** Quizzes and doubts ship switched off, but a flag hides the UI — PostgREST still serves `/rest/v1/quizzes` to anyone signed in. RLS is the only control.

---

## Not built

**Dark mode — decided against, not deferred.**

A full dark palette was built and then removed at the client's direction (14 Aug 2026): the platform ships in the brand light theme only.

It is worth recording *why* the work is not sitting in a branch waiting to be merged. A second palette is not a stylesheet — it is a second set of contrast obligations that every future component has to satisfy. The build surfaced three real failures in existing code within minutes:

- `bg-primary text-white` measured **2.51:1** on the dark ground, because the accent has to be lightened on dark to stay readable as text, and white then fails on top of it.
- `text-primary-border` was doing double duty as "light text on the brand gradient" in three places, which only worked because the light theme happens to make that token pale.

Every one of those is a permanent tax on adding a component. With ~200 students on one brand, the trade did not pay for itself.

If it is ever revisited: Tailwind v4 puts `@theme` tokens on `:root`, so a dark theme is the same class names reading different values — override the custom properties under `[data-theme='dark']`, resolve the choice from a cookie in the root layout (not an inline script, which still runs after first paint), and leave the attribute **absent** for "system" so `:root:not([data-theme])` can let the media query through.
