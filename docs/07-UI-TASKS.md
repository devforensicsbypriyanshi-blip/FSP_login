# FSP — UI/UX Work Queue

_For the UI/UX contributor. Last verified 2026-08-12 against the live codebase._

**You own the UI and UX.** Backend — auth wiring, database queries, the config engine — is handled separately and is now largely done, which changes what is useful for you to build. Read "What changed" below before starting: several tasks from the first version of this document no longer exist.

---

## Before you start

```bash
git clone https://github.com/VeerBhanushali/FSP_WEBAPP.git
cd FSP_WEBAPP && npm install && cp .env.example .env.local
npm run dev          # http://localhost:3000
```

You need **two values** from the owner for `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Neither is secret. You do **not** need the service-role key.

Read `CONTRIBUTING.md` §10 (Brand & UI conventions) first — it is short and will save you rework.

**Before every push:** `npm run verify` (typecheck + lint + tests). CI runs the same plus format, build and security checks.

### The five rules that matter most

1. **All colour from tokens** in `src/app/globals.css`. Never a raw hex in a component.
2. **Never build a class name by interpolation.** `` `text-${x}` `` produces **no CSS** — Tailwind scans source statically. This has already caused one silent bug. Use a full-class lookup map.
3. **Mobile-first.** Start at 375px. Tap targets ≥ 44px. Inputs ≥ 16px on mobile or iOS Safari zooms the page on focus.
4. **Measure contrast, don't eyeball it.** Two tokens shipped failing WCAG AA until measured. Body text needs 4.5:1.
5. **Lucide icons cannot cross the Server→Client boundary** — they are `forwardRef` objects. Pass a string key and resolve the icon inside the client component.

---

## What changed on 2026-08-12

Priorities 1, 2 and most of 4 from the previous version of this queue **are now built**:

- The broken links are gone. Profile, settings, search and sign-out exist — but as **`/account`, `/account/settings`, `/search`**, one shared set rather than five per-portal copies. A person has one profile, not one per role they hold. The portal shell still wraps them, so an admin sees the admin sidebar around their profile and a student sees theirs.
- `loading.tsx` and `error.tsx` exist for every portal, plus `not-found.tsx`, `/403` and `global-error.tsx`.
- The course player (`/app/learning/[id]`), the calendar month grid, the recording page (`/app/live/[id]`) and onboarding are built and reading real rows.

**The student pages now render real data, not demo arrays.** Sign in with a real account to see them populated. An empty database means you are looking at genuine empty states — also worth reviewing.

---

## Priority 1 — Components the app now needs and does not have

These were Priority 3 before. They are Priority 1 now because real data made them load-bearing: actions can fail, and there is currently nowhere good to say so.

| # | Task | Notes |
|---|---|---|
| 1.1 | **Toast system** | Server Action results are reported inline or not at all. Needs a provider + hook, four semantic variants, auto-dismiss, and `role="status"` so screen readers announce it. The inline messages in `components/account/profile-form.tsx` and `components/account/device-list.tsx` should move onto it. |
| 1.2 | **Modal / dialog primitive** | Focus trap, Escape to close, scroll lock, focus returned to the trigger. The mobile lesson sheet in `components/player/course-player.tsx` hand-rolls this — replace it and delete the duplicate. |
| 1.3 | **Confirmation dialog** | Built on 1.2. **"Sign out other devices" in `/account/settings` currently fires immediately with no confirmation** — that is the first thing to fix with it. |
| 1.4 | **Tabs primitive** | Several pages fake tabs with buttons. |

---

## Priority 2 — Screens still missing

| # | Task | Notes |
|---|---|---|
| 2.1 | **Calendar week view** | The month grid (`components/calendar/month-grid.tsx`) and the mobile agenda exist; week does not. Use `date-fns` — do **not** add FullCalendar (~200 KB and it fights our tokens). Weeks start Monday, matching the ISO weekday array the schedule model stores. |
| 2.2 | **Quiz runner** | Timed MCQ player: question palette, mark-for-review, autosave indicator, submit confirmation, results screen. Large but self-contained, and the schema already exists. |
| 2.3 | **Offline banner** | The service worker has an offline page, but the app gives no in-app signal when the connection drops. Note that `SessionWatcher` deliberately stays silent when offline — do not make it announce a false sign-out. |
| 2.4 | **Empty states audit** | Now genuinely visible against an empty database. Covered: courses, live, calendar, notifications, search, devices. Still missing: notes, tests, doubts, store, mentorship, and every staff-portal list. |

---

## Priority 3 — Staff portals

`/studio`, `/admin`, `/support` and `/dev` still render demo arrays. Their backend is not built either, so **coordinate before starting** — the data shapes will change.

One exception worth doing early: **`/admin/enrollments`**. Payments ship disabled, so granting access by hand is the only way a student gets into a course at launch. The UI exists; what it needs is the states around a real submit — pending, failure, and the reason field's ten-character minimum enforced visibly rather than only in the database.

---

## Priority 4 — Polish

| # | Task | Notes |
|---|---|---|
| 4.1 | **Accessibility audit** | Run axe. Known gaps: the mobile drawer has no focus trap, and several icon-only buttons lack `aria-label`. Target zero critical violations. |
| 4.2 | **Keyboard navigation** | Tab order, visible focus everywhere, Escape closes overlays. The course player's lesson list is the most valuable one to get right. |
| 4.3 | **Reduced motion** | `prefers-reduced-motion` is handled globally in `globals.css`; verify new animations respect it. |
| 4.4 | **Dark mode** | Flag `ui.dark_mode` already exists. Tokens are semantic, so this is mostly adding a dark palette. |
| 4.5 | **iOS install prompt** | iOS gets **no push notifications at all** until the app is added to the home screen. Onboarding step 3 says so in words; a real install prompt would say it better. Roughly a third of students are on iPhone. |

---

## What NOT to do

- **Don't add Supabase queries to Client Components.** Reads live in `src/lib/data/*` (server-only), writes in `src/lib/actions/*` (Server Actions). A client-side query bypasses that split and loses the RLS context it depends on.
- **Never `select('*')` from `live_sessions`.** The `join_url` column is REVOKEd from `authenticated`, so a star-select fails the *entire* query for a student. Name your columns.
- **Don't edit `src/types/database.ts`** — generated from the live schema.
- **Don't edit files in `supabase/`** — that's backend.
- **Don't add a component library.** We have `shadcn`-style primitives we own in `src/components/ui/`. Extend those.
- **Don't touch `FSP_Frontend_UI_Package/`** — retired mockups: off-brand, desktop-only, and the source of a "blank page" bug caused by an undefined CSS class.

---

## Verifying your work

```bash
npm run verify                       # typecheck + lint + tests
node scripts/find-broken-links.mjs   # currently reports zero
```

The link scanner only matches literal `href="..."`, so it misses interpolated ones like ``href={`/app/learning/${slug}`}`` — which is exactly how four dead links went unnoticed the first time. If you add a dynamic link, confirm the route exists by hand.

Then check at **375px, 768px, 1024px and 1440px**. The reference mockups had zero media queries and broke on every device — that is the exact complaint this rebuild exists to fix, so please don't reintroduce it.

Open a draft PR early with a screenshot. Partly-finished work with a clear question beats a week of silence.
