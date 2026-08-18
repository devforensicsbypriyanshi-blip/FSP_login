# Forensic Science by Priyanshi — Ed-Tech PWA

UGC NET & Forensic Science exam preparation platform. Next.js 15 · Supabase · Cloudinary · Razorpay · Resend, deployed on Vercel.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in Supabase values
npm run dev                    # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (Vercel runs this) |
| `npm run build:local` | Production build into `.next-build` — **use this while `dev` is running** |
| `npm run verify` | typecheck + lint + unit tests — run before every push |
| `npm run test` / `test:watch` | Vitest |
| `npm run e2e` | Playwright (Phase 7) |
| `npm run db:types` | Regenerate `src/types/database.ts` from the live schema |
| `npm run db:diff -- <name>` | Author a new migration |
| `npm run db:push` | Apply migrations |

---

## For new contributors

Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup, access, conventions, and the project decisions that are not obvious from the code.

## Documentation

Read these in order — they are the source of truth for every decision.

| Part | Document | Covers |
|---|---|---|
| 0 | [Overview, Decisions & Roadmap](docs/00-OVERVIEW-DECISIONS-ROADMAP.md) | Constraints, locked stack, 8-phase plan |
| 1 | [System Architecture](docs/01-SYSTEM-ARCHITECTURE.md) | Architecture, frontend, API, backend flows, Drive/calendar/join-link mechanics, storage, PWA |
| 2 | [Database Schema](docs/02-DATABASE-SCHEMA.md) | Postgres schema, RLS, indexes, triggers, cron |
| 3 | [Security, Ops, CI/CD & Scaling](docs/03-SECURITY-OPS-CICD-SCALING.md) | Auth/RBAC, security, rate limits, monitoring, CI/CD, testing, scaling, LiveKit v2 |
| 4 | [Sessions, OTP, Calendar & Notifications](docs/04-SESSIONS-OTP-CALENDAR-NOTIFICATIONS.md) | Single-session device lock, idle logout, email OTP, recurring calendar engine, cross-device push |
| 5 | [Registration & Platform Config](docs/05-REGISTRATION-AND-PLATFORM-CONFIG.md) | Email-OTP registration (no Google, no phone) and the runtime feature-flag + settings engine |
| 6 | [**PRD**](docs/06-PRD.md) | Product requirements — personas, 200-student sizing, requirements by priority, metrics, cost, risks |

> **Scale:** this platform serves **~200 students**. The numbers in the UI mockups (6,240 students, 284 live attendees) are placeholder demo content. See PRD §2 before making any capacity or cost argument.

> The original `FSP_Frontend_UI_Package/` static mockups are no longer tracked in git. They were off-brand (purple, not the navy/amber brand), had zero media queries, and contained a broken notification page. The React app in `src/` replaces them; the brand now comes from the live site at forensicbypriyanshi.vercel.app.

---

## Architecture in one paragraph

One Next.js app serves five role-scoped portals (`/app`, `/studio`, `/admin`, `/support`, `/dev`). Reads go **directly from the browser to Supabase**, where Row Level Security is the authority. Anything the browser could lie about — payments, webhooks, live-class join links, quiz scoring, admin actions — goes through a Route Handler using the service-role key after its own authorisation check. Video is Google Drive `/preview` iframes; live classes are Google Meet; images are Cloudinary; documents are private Supabase Storage behind 60-second signed URLs.

---

## Non-negotiable rules

1. **Every table has RLS enabled and at least one policy.** A table without a policy is unreadable — that is the correct default. CI enforces this.
2. **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** It bypasses RLS completely. It may appear only in `src/lib/env.ts` and `src/lib/supabase/admin.ts`; CI fails the build otherwise.
3. **Schema changes only through `supabase/migrations/`.** Never click-edit in the Supabase dashboard — it drifts from git and breaks CI.
4. **Never trust a client-supplied price, `user_id`, or timer.** Re-price from the database, use `auth.uid()`, and enforce deadlines against the server clock.
5. **Money and audit rows are append-only.** Corrections are new rows.
6. **`timestamptz` everywhere, UTC in the database, IST at the edge.**
7. **Mobile-first.** Every screen starts at 375px and grows. Tap targets ≥ 44px; inputs ≥ 16px on mobile or iOS Safari zooms the viewport on focus.
8. **Colour must clear WCAG AA** (4.5:1 body, 3:1 large text) and come from the tokens in `src/app/globals.css` — never raw hex.

---

## Project layout

```
src/
  app/            routes — (student)/app, (educator)/studio, (admin)/admin, …, api/
  components/     ui/ (primitives) · fsp/ (branded) · calendar/ · player/
  features/       vertical slices: courses, live, doubts, quiz, payments…
  lib/            supabase clients, drive parser, env contract, utils
  types/          generated database types
supabase/
  migrations/     the only way schema changes
  tests/          pgTAP — RLS assertions
docs/             design documents
e2e/              Playwright
```

---

## Status

**Built:** all five portals across 41 routes as responsive, brand-aligned UI · full Postgres schema with RLS · pgTAP suite · PWA (service worker, icons, install prompt) · CI with secret scanning and RLS coverage checks.

**Not yet wired:** the UI runs on demo data. Auth, data fetching and the config engine still need connecting to Supabase — search for `TODO(Phase 1)`. **The SQL migrations have never been run against a live database.**

**Blocked on the owner:** a Supabase project (region `ap-south-1`, Mumbai), Resend SMTP configured inside Supabase Auth (the built-in mailer is throttled to a few messages per hour, so registration will not work without it), and confirmation of the Google Workspace tier.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.
