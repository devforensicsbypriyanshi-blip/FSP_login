#!/usr/bin/env node
/**
 * Reports which environment variables are configured, and what breaks without
 * each one.
 *
 * NEVER PRINTS A VALUE. Not truncated, not masked, not "first four characters".
 * A tool that prints part of a secret is a tool someone eventually screenshots,
 * and the whole point of this file is to be safe to run while screen-sharing.
 *
 * The "breaks" column is the useful part. "EMAIL_POOLS missing" means nothing
 * at 2am; "no student can sign in" means something.
 *
 *   npm run env:check
 */

import { existsSync, readFileSync } from 'node:fs';

const FILE = process.argv[2] ?? '.env.local';

const VARS = [
  // --- Required -------------------------------------------------------------
  ['NEXT_PUBLIC_SUPABASE_URL', 'required', 'Nothing works — no database, no auth'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'required', 'Nothing works — no database, no auth'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'required', 'Webhooks and the notification worker fail'],
  ['NEXT_PUBLIC_SITE_URL', 'required', 'Sign-in links point at the wrong host'],

  // --- Needed for the features that use them --------------------------------
  ['EMAIL_POOLS', 'email', 'No reminders, no receipts, no notification emails'],
  ['CRON_SECRET', 'email', 'The queue worker refuses every request — it fails closed'],
  ['SES_SNS_TOPIC_ARNS', 'email', 'Bounces are not recorded; the suppression list stays empty'],

  ['RAZORPAY_KEY_ID', 'payments', 'Students cannot pay — manual enrolment still works'],
  ['RAZORPAY_KEY_SECRET', 'payments', 'Students cannot pay'],
  ['RAZORPAY_WEBHOOK_SECRET', 'payments', 'Payments succeed but never grant access'],

  // --- Optional -------------------------------------------------------------
  ['SESSION_COOKIE_SECRET', 'optional', 'Device check runs per-request instead of per-minute'],
  ['FIREBASE_SERVICE_ACCOUNT', 'optional', 'Reminders go by email only, no push'],
  ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'optional', 'No push notifications'],
  ['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'optional', 'Images serve unoptimised'],
];

if (!existsSync(FILE)) {
  console.error(`\n✖ ${FILE} not found.\n`);
  console.error('  Copy the template and fill it in:\n');
  console.error('    cp .env.example .env.local\n');
  process.exit(1);
}

// Parsed by name only. The value is measured for emptiness and then discarded —
// it is never stored, logged or returned.
const configured = new Set();
for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z_0-9]+)\s*=\s*(.*)$/.exec(line);
  if (match && match[2].trim().replace(/^["']|["']$/g, '').length > 0) {
    configured.add(match[1]);
  }
}

const GROUPS = {
  required: 'Required — the app will not start without these',
  email: 'Email — sign-in codes, reminders, receipts',
  payments: 'Payments — only needed when testing checkout',
  optional: 'Optional — everything works without these',
};

let missingRequired = 0;

console.log(`\nEnvironment check · ${FILE}\n`);

for (const [group, heading] of Object.entries(GROUPS)) {
  const rows = VARS.filter(([, g]) => g === group);
  if (!rows.length) continue;

  console.log(`  ${heading}`);
  for (const [name, , breaks] of rows) {
    const ok = configured.has(name);
    if (!ok && group === 'required') missingRequired += 1;

    const mark = ok ? '✔' : group === 'optional' ? '·' : '✖';
    console.log(`    ${mark} ${name.padEnd(36)} ${ok ? '' : breaks}`);
  }
  console.log('');
}

const unknown = [...configured].filter((name) => !VARS.some(([n]) => n === name));
if (unknown.length) {
  console.log('  Set but not recognised (fine — just not used by this checker)');
  for (const name of unknown) console.log(`    ? ${name}`);
  console.log('');
}

if (missingRequired > 0) {
  console.error(`✖ ${missingRequired} required variable(s) missing. The app will not start.\n`);
  process.exit(1);
}

console.log('✔ All required variables are set.\n');
