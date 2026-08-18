#!/usr/bin/env node
/**
 * Fails the build if any migration is not safe to run twice.
 *
 * This exists because "safe to re-run" was asserted twice and was wrong twice.
 * Both times the failure landed on the owner mid-deploy, with a Postgres error
 * code and no obvious cause:
 *
 *   ERROR: 42710: policy "push tokens: own only" already exists
 *   ERROR: 42710: policy "enrollments: admin updates" already exists
 *
 * The second one slipped past a manual audit because that audit matched drops
 * to creates by *adjacency*. The statement was:
 *
 *   drop policy if exists "enrollments: staff updates" on public.enrollments;
 *   create policy "enrollments: admin updates" on public.enrollments ...
 *
 * A drop directly above a create, for a different policy. It reads as guarded
 * and is not. Only matching on the exact (name, table) pair catches it, which
 * is a thing a script does reliably and a person does not.
 *
 * Postgres has no CREATE POLICY IF NOT EXISTS, so the guard has to be an
 * explicit DROP POLICY IF EXISTS for the same name on the same table.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'supabase/migrations';
const BOOTSTRAP = 'supabase/bootstrap/RUN-NEXT-session-and-seed.sql';

const files = [
  ...readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(MIGRATIONS, f)),
  BOOTSTRAP,
];

const problems = [];
let policiesChecked = 0;

for (const file of files) {
  let sql;
  try {
    sql = readFileSync(file, 'utf8');
  } catch {
    continue; // BOOTSTRAP is optional; a fresh clone may not have run it yet.
  }

  // ---- Policies -----------------------------------------------------------
  // The table may sit on the next line, so the newline is optional here. A
  // pattern anchored to one line misses four statements in 0008.
  const guards = new Set(
    [...sql.matchAll(/drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+([\w.]+)/gi)].map(
      (m) => `${m[1]}|${m[2]}`
    )
  );

  for (const match of sql.matchAll(/create\s+policy\s+"([^"]+)"\s*(?:\r?\n)?\s*on\s+([\w.]+)/gi)) {
    policiesChecked += 1;
    const [, name, table] = match;
    if (!guards.has(`${name}|${table}`)) {
      problems.push(
        `${file}\n    create policy "${name}" on ${table}\n    → needs: drop policy if exists "${name}" on ${table};`
      );
    }
  }

  // ---- Everything else that has no IF NOT EXISTS form ---------------------
  const bare = [
    ['create table', /create\s+table\s+(?!if\s+not\s+exists)\w/gi],
    ['create index', /create\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists|concurrently)\w/gi],
    // `create function` without `or replace` fails on the second run.
    ['create function', /create\s+function\s+/gi],
    ['create view', /create\s+view\s+(?!if\s+not\s+exists)\w/gi],
    ['add column', /add\s+column\s+(?!if\s+not\s+exists)\w/gi],
  ];

  for (const [label, pattern] of bare) {
    for (const match of sql.matchAll(pattern)) {
      const line = sql.slice(0, match.index).split('\n').length;
      problems.push(`${file}:${line}\n    ${label} without an IF NOT EXISTS / OR REPLACE guard`);
    }
  }

  // ---- Triggers -----------------------------------------------------------
  const droppedTriggers = new Set(
    [...sql.matchAll(/drop\s+trigger\s+if\s+exists\s+(\w+)/gi)].map((m) => m[1])
  );
  for (const match of sql.matchAll(/create\s+trigger\s+(\w+)/gi)) {
    if (!droppedTriggers.has(match[1])) {
      problems.push(
        `${file}\n    create trigger ${match[1]}\n    → needs: drop trigger if exists ${match[1]} on <table>;`
      );
    }
  }

  // ---- Constraints --------------------------------------------------------
  // Two acceptable guards: a preceding DROP CONSTRAINT IF EXISTS, or a
  // do-block that checks pg_constraint first.
  const droppedConstraints = new Set(
    [...sql.matchAll(/drop\s+constraint\s+if\s+exists\s+(\w+)/gi)].map((m) => m[1])
  );
  const lookedUp = new Set([...sql.matchAll(/conname\s*=\s*'(\w+)'/gi)].map((m) => m[1]));
  for (const match of sql.matchAll(/add\s+constraint\s+(\w+)/gi)) {
    const name = match[1];
    if (!droppedConstraints.has(name) && !lookedUp.has(name)) {
      problems.push(
        `${file}\n    add constraint ${name}\n    → needs a preceding drop-if-exists, or a pg_constraint check`
      );
    }
  }

  // ---- Enums --------------------------------------------------------------
  // CREATE TYPE has no IF NOT EXISTS; the codebase wraps them in a do-block
  // that swallows duplicate_object.
  for (const match of sql.matchAll(/create\s+type\s+(\w+)/gi)) {
    const after = sql.slice(match.index, match.index + 600);
    if (!/duplicate_object/i.test(after)) {
      problems.push(
        `${file}\n    create type ${match[1]}\n    → needs: do $$ begin ... exception when duplicate_object then null; end $$;`
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`\n✖ ${problems.length} statement(s) would fail on a second run:\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  console.error('Every migration must be safe to paste twice. A partial failure');
  console.error('means the owner fixes the cause and re-runs the whole file.\n');
  process.exit(1);
}

console.log(`✔ migrations are re-runnable (${policiesChecked} policies, ${files.length} files)`);
