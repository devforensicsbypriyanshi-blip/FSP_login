# UI handover

_For the designer/front-end person taking over the interface. Written 14 Aug 2026._

Everything here is about **how the UI is built and what is safe to change**. The data layer is finished and wired; you should not need to touch it, and there are a few places where touching it would silently break security. Those are marked 🔒.

---

## 1 · Get it running

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill it — ask the owner for values, **never** take them from a screenshot or chat. Without Supabase credentials the app builds and renders, but every page shows empty states.

Before you commit:

```bash
npm run verify
```

That runs typecheck, lint, 131 tests and a migration check. **It must pass.** CI runs the same thing.

---

## 2 · The design system

There is one, and it is small on purpose. Read `src/app/globals.css` first — it is heavily commented and explains the brand decisions.

### Colour

Never write a hex code in a component. Every colour is a token:

| Use | Token | Class |
|---|---|---|
| Page background | `--color-app` | `bg-app` |
| Card background | `--color-surface` | `bg-surface` |
| Body text | `--color-ink` | `text-ink` |
| Secondary text | `--color-ink-secondary` | `text-ink-secondary` |
| Quiet text | `--color-ink-muted` | `text-ink-muted` |
| Accent / links | `--color-primary` | `text-primary`, `bg-primary` |
| Borders | `--color-line`, `--color-line-medium` | `border-line` |
| Feedback | `success` / `error` / `warning` / `info`, each with `-bg` and `-border` | `text-error bg-error-bg border-error-border` |

**Two rules that are not style preferences:**

1. **Amber is a fill, never text.** `#F59F59` on white is 2.1:1 and fails WCAG. It carries navy text on top (`--color-cta-ink`), which is ~8:1. If you need an amber-coloured *word*, use `--color-amber-deep`.
2. **The greys were measured, not picked.** `--color-ink-light` is `#67637c` because `#9A96AB` measured 2.5:1 and `#736F88` measured 4.25:1 on the muted tint — both under AA. Don't lighten them back.

### Type

- `font-display` (Poppins) — headings only, always `font-bold`, `-0.025em` tracking
- `font-sans` (Inter) — everything else
- Sizes are literal (`text-[13.5px]`), not the Tailwind scale. That was deliberate to match the marketing site; keep it consistent within a screen rather than converting piecemeal.

### Spacing and shape

- Cards: `rounded-2xl`, padding `p-4 md:p-5`
- Buttons/inputs: `rounded-[10px]`
- Pills/badges: `rounded-full`
- Gap between page sections: the portal layout already applies it — don't add outer margins to page components.

---

## 3 · The primitives

In `src/components/ui/`. **Use these before writing anything new.**

| Component | What it's for | Notes |
|---|---|---|
| `Button` | All actions | Variants: `primary`, `outline`, `ghost`, `danger`, `danger-outline`, `secondary`, `subtle`. Has `loading` — use it, don't roll a spinner |
| `Card`, `CardHeader`, `CardTitle`, `PageHeader` | Page structure | Every page starts with `PageHeader` |
| `DataTable` | Any list of records | **Renders a real `<table>` at md+ and labelled cards below.** Don't use `overflow-x-auto` tables — on a 375px screen that means sideways scrolling to read one row |
| `KpiCard` | Stat tiles | In `data-table.tsx` |
| `EmptyState` | Zero results | Always give it a `description` that says what will make content appear |
| `Field`, `Input`, `Textarea`, `Select`, `FieldError` | Forms | `Field` handles the label/hint/error wiring and `aria-describedby` |
| `Badge` | Status | `success` `warning` `error` `info` `gray` `purple`, plus `dot` and `pulse` |
| `Dialog`, `ConfirmDialog` | Modals | Focus trap and Escape are already handled |
| `Toast` | Transient feedback | |
| `Progress` | Bars | Lesson-level only — see §6 |
| `Tabs`, `Avatar`, `PageSkeleton`, `ErrorScreen`, `StatusScreen` | | |

If you need a new primitive, put it here rather than inline in a page, so the next screen gets it too.

---

## 4 · Layout and navigation

`src/components/layout/nav-config.ts` is the single source of truth for **all five portals** (student, educator, admin, support, developer). Adding a nav item is a line in that file — never hardcode navigation in a page.

```ts
{ href: '/studio/notes', label: 'Study Material', shortLabel: 'Material',
  icon: FileText, primary: true, flag: 'module.notes' }
```

- `shortLabel` is what the mobile bottom bar shows
- `primary: true` promotes it into the mobile bottom bar (max ~5)
- `flag` hides it when that feature flag is off

Mobile uses a bottom tab bar, desktop a sidebar. Both read the same config.

---

## 5 · Where the real UI work is

Everything below is wired to live data and looks *fine*, but has had no design pass. This is the actual job.

### High value — students see these daily

| Route | State | What it needs |
|---|---|---|
| `/app` | Real | Home dashboard. Currently a stack of cards; wants a real hierarchy — "what do I do right now" |
| `/app/live` | Real | Live-now hero is decent. Upcoming list is plain |
| `/app/learning/[id]` | Real | Course player. The video area and lesson list need the most attention of any screen |
| `/app/tests/attempt/[id]` | Real | Quiz runner. Timer, question palette and submit flow are functional but visually bare |
| `/app/notes/[id]` | Real | **New.** Reading view with watermark — typography matters here more than anywhere |
| `/onboarding` | Real | Three steps, skippable. First impression |

### Educator — used weekly by one person

| Route | State | Notes |
|---|---|---|
| `/studio/quizzes/[id]` | Real | **New.** Question builder — the densest form in the app |
| `/studio/notes` | Real | **New.** Markdown editor with a toolbar |
| `/studio/live/[id]` | Real | **New.** Attendance register |
| `/studio/mentorship` | Real | **New.** Slot publisher |
| `/studio/doubts`, `/studio/broadcasts` | Real | **New.** |

### Admin / dev — used rarely, style last

`/admin/*` and `/dev/*` are all wired and functional. Low priority.

### Still demo data — needs both design *and* wiring

These five are the only screens left showing hardcoded content:

```
/support/chat          37 lines
/support/escalations   26 lines
/support/kb            30 lines
/support/materials    145 lines
/support/tests        156 lines
```

Don't polish these in isolation — the data model for them doesn't exist yet. Flag it to the owner before spending time.

---

## 6 · Things that look like bugs and are not

Please read this section before "fixing" any of them.

**Progress bars are lesson-level, permanently.** The course video is a cross-origin Google Drive iframe that emits no playback events. Watch-time is genuinely unobtainable. Hence the explicit "Mark complete" button rather than an inferred percentage — a number we cannot measure must not be displayed as if we could.

**Email on `/account` is read-only.** It is the login credential and there is no password to fall back on. A typo would lock someone out permanently.

**The join button is not a link.** 🔒 Meet URLs, Drive file ids and external note links are all issued by server routes after an enrolment check. They are deliberately absent from the HTML. Turning any of them into an `<a href>` would defeat the entire access model.

**The new tab opens *before* the fetch.** 🔒 In `join-button.tsx` and `open-link-button.tsx`, `window.open()` runs synchronously on click and the URL is assigned after. Browsers only permit `window.open` during a user gesture — moving it after the `await` gets it blocked as a popup, which reads to a student as a broken button.

**The reading view blocks copy and blurs on tab-out.** Intentional. It is a deterrent, not a lock, and the docs say so plainly. Don't remove it, and don't advertise it as DRM.

**Some pages are visually "empty" locally.** Most modules are flagged off (§8) and most data needs a signed-in user with an enrolment.

**Dark mode is not coming.** It was built and removed on 14 Aug at the client's direction. `docs/09-PAGES-AND-DECISIONS.md` records why, with the specific contrast failures. Please don't re-add it without asking.

---

## 7 · Accessibility — the bar to hold

This has been enforced so far and should stay enforced.

- **Contrast:** 4.5:1 for body text, 3:1 for large text (≥24px, or ≥18.66px bold). Every token in `globals.css` was measured against its worst-case surface, not against white.
- **Never** set `maximum-scale` or `user-scalable=no`. It breaks pinch-zoom for low-vision users.
- Every interactive element needs a visible focus ring — the global `:focus-visible` rule handles it, so don't `outline: none` anything.
- Icons are decorative: `aria-hidden`. Icon-only buttons need `aria-label`.
- `prefers-reduced-motion` is respected globally. New animations must be inside `@layer` so the existing rule disables them.

A quick contrast sweep you can paste into the devtools console on any page:

```js
// Reports any text failing AA against its resolved background.
const cv = document.createElement('canvas'); cv.width = cv.height = 1;
const ctx = cv.getContext('2d', { willReadFrequently: true });
const toRgb = (c, over='rgb(255,255,255)') => { ctx.fillStyle=over; ctx.fillRect(0,0,1,1); ctx.fillStyle=c; ctx.fillRect(0,0,1,1); const d=ctx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2]]; };
const lum = ([r,g,b]) => { const f=v=>{const c=v/255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const bgOf = el => { let n=el; while(n && n!==document.documentElement){ const cs=getComputedStyle(n);
  if (cs.backgroundImage!=='none'){ const s=cs.backgroundImage.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i); if(s) return toRgb(s[1]); }
  if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) return toRgb(cs.backgroundColor); n=n.parentElement; }
  return toRgb(getComputedStyle(document.body).backgroundColor); };
for (const el of document.querySelectorAll('body *')) {
  if (![...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())) continue;
  const cs = getComputedStyle(el);
  if (cs.visibility==='hidden' || cs.display==='none' || +cs.opacity<0.5) continue;
  const size = parseFloat(cs.fontSize);
  const need = size>=24 || (size>=18.66 && +cs.fontWeight>=700) ? 3 : 4.5;
  const bg = bgOf(el), r = ratio(toRgb(cs.color, `rgb(${bg})`), bg);
  if (r < need) console.warn(r.toFixed(2), '<', need, el.textContent.trim().slice(0,40), el);
}
```

> Note: a naive version of this reports false failures on `oklab()` colours (Tailwind emits them for opacity modifiers). The canvas step above resolves any syntax to sRGB, which is why it's there.

---

## 8 · Feature flags

`src/lib/flags.ts`. Most modules ship **off**:

```
module.courses      true
module.live_classes true
module.calendar     true
module.notes        false
module.quizzes      false
module.doubts       false
module.store        false
module.mentorship   false
module.payments     false
module.analytics    false
module.support_desk false
```

Flip one to `true` locally to see that portal section. **They are off because the database migrations have not been applied to production yet**, not because the UI is unfinished.

🔒 **A flag hides the UI, not the data.** Never treat one as a security control — PostgREST still serves the table. Access is Row Level Security, always.

---

## 9 · Conventions worth matching

**Server Components by default.** Add `'use client'` only when you need state, effects or event handlers. Data fetching lives in `src/lib/data/*` and is called from the page; components receive props.

**Forms use `useActionState`** with a server action from `src/lib/actions/*`. The pattern is everywhere — copy `broadcast-composer.tsx` for a good example including the confirm step.

**Error and loading states already exist** — 12 `loading.tsx` / `error.tsx` / `not-found.tsx` files. Match their look when adding more.

**Comments explain *why*, not *what*.** The codebase is written this way throughout. If you make a non-obvious choice, say why in a sentence — especially anything that looks wrong but isn't.

**Copy is part of the UI.** Error messages name the likely cause and the fix ("The room opens 15 minutes before it starts"), never a code. Empty states say what will make content appear. Please keep that voice.

---

## 10 · What not to touch 🔒

Changing any of these breaks security, not just layout:

| File / pattern | Why |
|---|---|
| `src/lib/data/live.ts` — `SESSION_COLUMNS` | Never add `join_url`, never `select('*')`. That column is REVOKEd; naming it makes the whole query fail |
| `src/lib/data/library.ts` — `RESOURCE_COLUMNS` | Same, for `external_url` |
| `src/app/api/**` | Every route enforces an access rule |
| `src/middleware.ts` | Auth, role guards, device lock |
| `src/lib/notes/markdown.ts` | Renders note bodies. It is safe *by construction* — swapping in a markdown library would reintroduce the XSS risk it exists to avoid |
| `supabase/**` | Database and RLS |
| Any `dangerouslySetInnerHTML` | There are exactly two, both fed by `renderNote()`. Don't add a third |

If a UI change seems to need one of these, ask first — there is usually a safe way.

---

## 11 · Suggested order

1. `/app` home — highest traffic, most impact
2. `/app/learning/[id]` course player — where students spend their time
3. `/app/live` and `/app/notes/[id]` — the two other daily screens
4. `/onboarding` — first impression
5. `/app/tests/attempt/[id]` — high stakes, needs to feel calm
6. Studio screens — one person, but they use them weekly
7. Admin/dev — last

A full mobile pass at 375px is worth doing before any of it. The app is a PWA and most students are on phones.

---

## 12 · Reference

| Doc | What's in it |
|---|---|
| `docs/09-PAGES-AND-DECISIONS.md` | Every route, its guard, and the reasoning. **Read before adding a page** |
| `CONTRIBUTING.md` | Full conventions, domains, security |
| `docs/08-EMAIL-SETUP.md` | SES/SNS — owner-facing, not UI |
| `src/app/globals.css` | Design tokens with the reasoning inline |
| `src/components/layout/nav-config.ts` | All navigation |

Questions about *why* something is the way it is: check `docs/09` first. Most of it is already answered there, including the things that look like mistakes.
