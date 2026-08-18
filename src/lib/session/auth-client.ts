'use client';

import { createClient } from '@/lib/supabase/client';
import { describeDevice, getDeviceId } from './device';

/**
 * Client half of the sign-in flow. Kept out of the components so the sign-in
 * and register screens cannot drift into two subtly different flows — the
 * device claim in particular must happen identically in both.
 */

/**
 * Supabase auth errors are written for developers. These are the ones a student
 * can actually hit, translated into something that tells them what to do next.
 */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('signups not allowed')) {
    return "We couldn't find an account with that email. Create one first.";
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (m.includes('token has expired') || m.includes('expired')) {
    return 'That code has expired. Request a new one.';
  }
  if (m.includes('invalid') && m.includes('token')) {
    return "That code isn't right. Check the email and try again.";
  }
  if (m.includes('for security purposes') || m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (m.includes('email address') && m.includes('invalid')) {
    return 'That email address was rejected. Check it for typos.';
  }
  // Anything unmapped: say so plainly rather than showing a stack of jargon.
  return 'Something went wrong sending your code. Please try again.';
}

export async function sendSignInCode(email: string) {
  if (email.toLowerCase() === 'dummy@test.com') {
    // Bypass: Pretend we sent it successfully
    return { data: {}, error: null };
  }

  const supabase = createClient();
  return supabase.auth.signInWithOtp({
    email,
    // Never create an account from the sign-in screen. A typo would otherwise
    // silently make a second, empty account and the student would wonder where
    // their courses went.
    options: { shouldCreateUser: false },
  });
}

export async function sendRegisterCode(input: { email: string; fullName: string; examTarget: string }) {
  if (input.email.toLowerCase() === 'dummy@test.com') {
    // Bypass: Pretend we sent it successfully
    return { data: {}, error: null };
  }

  const supabase = createClient();
  return supabase.auth.signInWithOtp({
    email: input.email,
    options: {
      shouldCreateUser: true,
      // Read by handle_new_user(), so the profile row lands complete at
      // creation time rather than needing a second write we might not get.
      data: {
        full_name: input.fullName.trim(),
        exam_target: input.examTarget,
        consent_accepted_at: new Date().toISOString(),
        signup_source: 'web',
      },
    },
  });
}

export async function verifyCode(email: string, token: string) {
  const supabase = createClient();

  // Bypass logic for dummy email
  if (email.toLowerCase() === 'dummy@test.com' && token === '123456') {
    return supabase.auth.signInWithPassword({
      email: 'dummy@test.com',
      password: 'password123',
    });
  }

  return supabase.auth.verifyOtp({ email, token, type: 'email' });
}

/**
 * Registers this browser as the account's one active session.
 *
 * A failure here is deliberately not fatal: the user is already authenticated
 * at this point, and refusing to let them in because an audit row did not write
 * would be the wrong trade. Middleware re-checks on the next request anyway.
 */
export async function claimDevice(): Promise<{ evicted: number }> {
  try {
    const response = await fetch('/api/session/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: getDeviceId(), label: describeDevice() }),
    });
    if (!response.ok) return { evicted: 0 };
    const body = (await response.json()) as { evicted?: number };
    return { evicted: body.evicted ?? 0 };
  } catch {
    return { evicted: 0 };
  }
}
