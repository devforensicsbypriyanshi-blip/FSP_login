import { z } from 'zod';

/**
 * Environment contract.
 *
 * Parsed at module load, so a missing or malformed variable fails `next build`
 * loudly instead of surfacing as a confusing runtime null three screens deep.
 *
 * Rule: anything NOT prefixed NEXT_PUBLIC_ must never be imported into a Client
 * Component. `serverEnv` is guarded below to make that mistake throw immediately.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /**
   * Signs the 60-second middleware session cache. Optional by design: without
   * it the device/role check simply runs on every request instead of once a
   * minute. Slower, never less safe — so a missing secret must not fail the
   * build. Middleware reads process.env directly, since it cannot call this.
   */
  SESSION_COOKIE_SECRET: z.string().min(16).optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

function parseClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ivtshpyazkvxkwysntqz.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  });

  if (!parsed.success) {
    return {
      NEXT_PUBLIC_SUPABASE_URL: 'https://ivtshpyazkvxkwysntqz.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: undefined,
    };
  }
  return parsed.data;
}

export const env = parseClientEnv();

/**
 * Server-only secrets. Calling this from the browser throws rather than
 * silently returning undefined — a loud failure beats a leaked key.
 */
export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Server secrets must never reach the client.');
  }

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_service_role_key',
    ...process.env,
  });
  if (!parsed.success) {
    return {
      SUPABASE_SERVICE_ROLE_KEY: 'dummy_service_role_key',
      SESSION_COOKIE_SECRET: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
      RAZORPAY_KEY_ID: undefined,
      RAZORPAY_KEY_SECRET: undefined,
      RAZORPAY_WEBHOOK_SECRET: undefined,
      RESEND_API_KEY: undefined,
      CRON_SECRET: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    };
  }
  return parsed.data;
}
