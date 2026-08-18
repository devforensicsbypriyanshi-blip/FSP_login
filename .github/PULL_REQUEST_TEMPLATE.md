## What & why

<!-- One paragraph. Link the phase/task from docs/00-OVERVIEW-DECISIONS-ROADMAP.md §5. -->

## Checklist

- [ ] `npm run verify` passes locally (typecheck + lint + tests)
- [ ] Tested at 375px width, not just desktop
- [ ] No `console.log` left behind (use `lib/logger`)

### If this touches the database

- [ ] Change is a migration in `supabase/migrations/` — not a dashboard edit
- [ ] Every new table has `enable row level security` **and** at least one policy
- [ ] pgTAP test added asserting a *different* user cannot read these rows
- [ ] `npm run db:types` re-run and the result committed

### If this touches auth, payments, or the live join link

- [ ] Authorisation re-checked server-side, not only in the UI
- [ ] No client-supplied price, `user_id`, or deadline is trusted
- [ ] Rate limit applied to the new endpoint
- [ ] Action written to `audit_logs`

## Rollback

<!-- How do we undo this if it misbehaves in production? -->
