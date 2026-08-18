import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fromPending } from '@/lib/supabase/rpc';

/**
 * Stores an FCM registration token against the signed-in user.
 *
 * Runs under the user's own client, not the service role: push_tokens is
 * `for all using (user_id = auth.uid())`, so RLS refuses a token filed against
 * anyone else. A route that used the service role here would need to re-derive
 * that check by hand, and getting it wrong would let one account register a
 * token that silently receives another account's notifications.
 */

const bodySchema = z.object({
  token: z.string().trim().min(20).max(4096),
  deviceLabel: z.string().max(80).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  // Upsert on (provider, token): the same browser re-registering must update its
  // row rather than accumulate duplicates that all deliver the same message.
  const { error } = await fromPending(supabase, 'push_tokens').upsert(
    {
      user_id: user.id,
      provider: 'fcm',
      token: parsed.data.token,
      device_label: parsed.data.deviceLabel ?? null,
      user_agent: request.headers.get('user-agent'),
      failure_count: 0,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'provider,token' }
  );

  if (error) {
    console.error('push token registration failed', { userId: user.id, message: error.message });
    return NextResponse.json({ error: 'REGISTER_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.pick({ token: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  await fromPending(supabase, 'push_tokens').delete().eq('token', parsed.data.token).eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
