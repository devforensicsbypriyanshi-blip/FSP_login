import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Typed access to database functions added *after* the last `npm run db:types`.
 *
 * src/types/database.ts is generated and must not be hand-edited, so between
 * writing a migration and applying it there is a window where a real function
 * has no generated type. This is the one, documented place that bridges it —
 * far better than an `as any` at each call site, which would survive long after
 * the types caught up and hide genuine mistakes.
 *
 * When `supabase/migrations/20260812000100_session_lifecycle.sql` has been
 * applied and `npm run db:types` re-run, delete this file and call
 * `supabase.rpc(...)` directly. The signatures below will already match.
 */

interface PendingFunctions {
  // 20260812000100_session_lifecycle.sql
  touch_session: { Args: { p_device_id: string }; Returns: boolean };
  end_session: { Args: { p_device_id: string }; Returns: void };
  mark_all_notifications_read: { Args: Record<string, never>; Returns: number };

  // 20260812000200_launch_content_seed.sql
  grant_course_access: {
    Args: { p_email: string; p_slug: string; p_reason: string; p_days: number | null };
    Returns: string;
  };

  // 20260812000300_educator_authoring.sql
  publish_schedule: { Args: { p_schedule: string; p_horizon_days: number }; Returns: number };
  set_session_recording: { Args: { p_session: string; p_drive_file_id: string }; Returns: void };
  cancel_live_session: { Args: { p_session: string; p_reason: string }; Returns: void };

  // 20260812000400_notification_queue.sql
  enqueue_for_course: {
    Args: {
      p_course: string;
      p_type: string;
      p_title: string;
      p_body?: string | null;
      p_data?: Record<string, unknown>;
      p_category?: string | null;
    };
    Returns: number;
  };
  /** Worker-only — reached with the service role, never granted to `authenticated`. */
  claim_notification_batch: { Args: { p_channel: string; p_limit: number }; Returns: unknown[] };
  /** 20260813000100 — also scheduled by pg_cron; the worker call is belt and braces. */
  enqueue_due_reminders: {
    Args: Record<string, never>;
    Returns: { kind: string; sessions: number; recipients: number }[];
  };
  complete_notification: {
    Args: { p_id: number; p_status: string; p_error: string | null };
    Returns: void;
  };

  // 20260813000300_support_desk.sql
  reply_to_ticket: { Args: { p_ticket: string; p_body: string; p_internal: boolean }; Returns: string };
  set_ticket_status: { Args: { p_ticket: string; p_status: string }; Returns: void };

  // 20260813000400_reschedule_occurrence.sql
  reschedule_occurrence: {
    Args: { p_session: string; p_starts_at: string; p_reason: string };
    Returns: void;
  };

  // 20260813000600_doubts_visibility.sql
  answer_doubt: { Args: { p_doubt: string; p_body: string }; Returns: string };

  // 20260814000100_attendance.sql
  join_live_session: {
    Args: { p_session: string; p_device_id: string | null; p_ip: string | null; p_user_agent: string | null };
    Returns: string;
  };
  /** Full roster — absent students come back with join_count 0 and null times. */
  get_session_attendance: {
    Args: { p_session: string };
    Returns: {
      user_id: string;
      full_name: string;
      email: string;
      first_joined: string | null;
      last_seen: string | null;
      join_count: number;
      device_count: number;
    }[];
  };
  get_my_attendance: {
    Args: { p_course: string | null };
    Returns: { course_id: string; course_title: string; held: number; attended: number }[];
  };

  // 20260814000200_studio_authoring.sql
  get_educator_courses: {
    Args: Record<string, never>;
    Returns: {
      course_id: string;
      title: string;
      slug: string;
      status: string;
      student_count: number;
    }[];
  };
  set_doubt_status: { Args: { p_doubt: string; p_status: string }; Returns: void };
  upsert_quiz: {
    Args: {
      p_quiz: string | null;
      p_course: string;
      p_title: string;
      p_description?: string | null;
      p_duration_min?: number;
      p_negative_mark?: number;
      p_shuffle?: boolean;
      p_max_attempts?: number;
      p_opens_at?: string | null;
      p_closes_at?: string | null;
    };
    Returns: string;
  };
  upsert_question: {
    Args: {
      p_quiz: string;
      p_question: string | null;
      p_body: string;
      p_options: { body: string; is_correct: boolean }[];
      p_explanation?: string | null;
      p_marks?: number;
      p_negative?: number;
      p_position?: number | null;
    };
    Returns: string;
  };
  delete_question: { Args: { p_question: string }; Returns: void };
  get_quiz_editor: {
    Args: { p_quiz: string };
    Returns: {
      question_id: string;
      body: string;
      explanation: string | null;
      marks: number;
      negative: number;
      q_position: number;
      options: { id: string; body: string; is_correct: boolean }[];
    }[];
  };
  set_quiz_status: { Args: { p_quiz: string; p_status: string }; Returns: void };
  send_broadcast: { Args: { p_course: string; p_title: string; p_body: string | null }; Returns: number };
  get_broadcasts: {
    Args: { p_limit: number };
    Returns: {
      id: string;
      title: string;
      body: string | null;
      recipients: number;
      created_at: string;
      course_title: string | null;
    }[];
  };

  // 20260814000300_notes_authoring.sql
  upsert_resource: {
    Args: {
      p_resource: string | null;
      p_course: string | null;
      p_title: string;
      p_kind: string;
      p_format: string;
      p_body_md?: string | null;
      p_external_url?: string | null;
      p_drive_file_id?: string | null;
      p_summary?: string | null;
      p_is_free?: boolean;
    };
    Returns: string;
  };
  set_resource_published: { Args: { p_resource: string; p_published: boolean }; Returns: void };
  delete_resource: { Args: { p_resource: string }; Returns: void };
  /** Returns the external URL for link resources, null for the rest. */
  log_resource_view: {
    Args: { p_resource: string; p_device_id: string | null; p_ip: string | null };
    Returns: string | null;
  };
  get_resource_readers: {
    Args: { p_resource: string };
    Returns: {
      user_id: string;
      full_name: string;
      email: string;
      views: number;
      last_read: string;
    }[];
  };

  // 20260814000400_admin_console.sql
  admin_list_users: {
    Args: { p_query: string | null; p_limit: number };
    Returns: {
      user_id: string;
      full_name: string;
      email: string;
      roles: string[];
      enrollments: number;
      created_at: string;
      last_seen_at: string | null;
    }[];
  };
  set_user_roles: { Args: { p_user: string; p_roles: string[] }; Returns: void };
  upsert_coupon: {
    Args: {
      p_coupon: string | null;
      p_code: string;
      p_kind: string;
      p_value: number;
      p_max_discount?: number | null;
      p_min_amount?: number;
      p_max_uses?: number | null;
      p_per_user?: number;
      p_valid_to?: string | null;
    };
    Returns: string;
  };
  set_coupon_active: { Args: { p_coupon: string; p_active: boolean }; Returns: void };
  submit_course_for_review: { Args: { p_course: string }; Returns: void };
  set_course_status: { Args: { p_course: string; p_status: string; p_note: string | null }; Returns: void };
  get_audit_logs: {
    Args: { p_action: string | null; p_limit: number };
    Returns: {
      id: number;
      actor_name: string;
      actor_email: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      ip: string | null;
      created_at: string;
    }[];
  };

  // 20260814000500_dev_console.sql
  get_system_health: {
    Args: Record<string, never>;
    Returns: {
      emails_failed_24h: number;
      emails_sent_24h: number;
      notifications_failed_24h: number;
      notifications_pending: number;
      notifications_stuck: number;
      webhooks_failed_24h: number;
      webhooks_received_24h: number;
      last_webhook_at: string | null;
      last_email_at: string | null;
    }[];
  };
  get_webhook_events: {
    Args: { p_provider: string | null; p_limit: number };
    Returns: {
      id: string;
      provider: string;
      event_id: string;
      event_type: string;
      status: string;
      error: string | null;
      attempts: number;
      received_at: string;
      processed_at: string | null;
    }[];
  };
  get_recent_failures: {
    Args: { p_limit: number };
    Returns: {
      source: string;
      subject: string;
      detail: string;
      attempts: number;
      failed_at: string;
    }[];
  };

  // 20260814000600_mentorship.sql
  get_mentors: {
    Args: Record<string, never>;
    Returns: {
      educator_id: string;
      full_name: string;
      avatar_url: string | null;
      headline: string | null;
      open_slots: number;
      from_price: number;
      next_slot: string;
    }[];
  };
  get_open_slots: {
    Args: { p_educator: string | null; p_days: number };
    Returns: {
      slot_id: string;
      educator_id: string;
      educator: string;
      starts_at: string;
      ends_at: string;
      price_inr: number;
      topic_hint: string | null;
    }[];
  };
  book_slot: {
    Args: { p_slot: string; p_topic: string | null; p_notes: string | null };
    Returns: {
      booking_id: string;
      order_id: string | null;
      price_inr: number;
      hold_expires: string | null;
    }[];
  };
  get_my_bookings: {
    Args: Record<string, never>;
    Returns: {
      booking_id: string;
      slot_id: string;
      counterpart: string;
      starts_at: string;
      ends_at: string;
      status: string;
      topic: string | null;
      price_inr: number;
      is_mine: boolean;
    }[];
  };
  get_booking_join_url: { Args: { p_booking: string }; Returns: string };
  create_slots: {
    Args: { p_starts: string[]; p_minutes: number; p_price_inr: number; p_topic: string | null };
    Returns: number;
  };
  set_booking_meet_url: { Args: { p_booking: string; p_url: string }; Returns: void };
  cancel_booking: { Args: { p_booking: string; p_reason: string | null }; Returns: void };

  // 20260813000800_email_pools.sql
  email_pool_usage_today: {
    Args: Record<string, never>;
    Returns: { pool_id: string; sent_count: number }[];
  };

  // 20260813000900_email_pool_monthly.sql — daily AND monthly in one round trip
  email_pool_usage: {
    Args: Record<string, never>;
    Returns: { pool_id: string; sent_today: number; sent_month: number }[];
  };

  // 20260813000700_checkout.sql
  validate_coupon: {
    Args: { p_code: string; p_amount_inr: number };
    Returns: { valid: boolean; discount_inr: number; reason: string | null }[];
  };
  create_order: {
    Args: { p_course_ids: string[]; p_coupon: string | null };
    Returns: { order_id: string; total_inr: number; subtotal_inr: number; discount_inr: number }[];
  };
  attach_gateway_order: { Args: { p_order: string; p_gateway_order_id: string }; Returns: void };
  /** Service-role only — never granted to `authenticated`. */
  fulfil_order: {
    Args: {
      p_gateway_order_id: string;
      p_gateway_payment_id: string;
      p_amount_inr: number;
      p_method: string | null;
      p_raw: unknown;
    };
    Returns: string;
  };
  fail_order: { Args: { p_gateway_order_id: string; p_reason: string }; Returns: void };

  // 20260813000500_quiz_engine.sql
  start_quiz_attempt: { Args: { p_quiz: string }; Returns: string };
  get_quiz_paper: {
    Args: { p_attempt: string };
    Returns: {
      question_id: string;
      body: string;
      marks: number;
      negative: number;
      q_position: number;
      options: { id: string; body: string }[] | null;
      chosen: string | null;
    }[];
  };
  save_quiz_response: {
    Args: { p_attempt: string; p_question: string; p_option: string | null };
    Returns: void;
  };
  submit_quiz_attempt: {
    Args: { p_attempt: string };
    Returns: { score: number; correct: number; wrong: number; skipped: number; total: number }[];
  };
  get_quiz_review: {
    Args: { p_attempt: string };
    Returns: {
      question_id: string;
      body: string;
      explanation: string | null;
      marks: number;
      awarded: number | null;
      chosen: string | null;
      correct: string | null;
      options: { id: string; body: string; correct: boolean }[] | null;
    }[];
  };
}

type RpcCaller = (
  name: string,
  args: unknown
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Tables added after the last `npm run db:types`, same story as the functions
 * above. `push_tokens` and `notification_queue` arrive in migration
 * 20260812000400; once it is applied and the types regenerated, replace
 * `fromPending(supabase, 'push_tokens')` with `supabase.from('push_tokens')`
 * and delete this.
 *
 * The cast is to an ungenerated client rather than to `any`, so the query
 * builder API itself stays typed — only the row shapes are unchecked.
 */
// email_log exists in the generated types; its `pool_id` column (migration
// 20260813000800) does not yet, which is enough to reject the whole update.
// Same for `resources` and its format/body_md/summary columns (0028) —
// PostgREST's typed builder rejects the entire select when one column in the
// list is unknown, not just that column.
type PendingTable = 'push_tokens' | 'notification_queue' | 'email_log' | 'resources' | 'broadcasts';

type UntypedClient = { from: (table: string) => ReturnType<SupabaseClient['from']> };

export function fromPending(client: SupabaseClient<Database>, table: PendingTable) {
  return (client as unknown as UntypedClient).from(table);
}

export async function callPendingRpc<K extends keyof PendingFunctions>(
  client: SupabaseClient<Database>,
  name: K,
  args: PendingFunctions[K]['Args']
): Promise<{ data: PendingFunctions[K]['Returns'] | null; error: { message: string } | null }> {
  const { data, error } = await (client.rpc as unknown as RpcCaller)(name, args);
  return { data: data as PendingFunctions[K]['Returns'] | null, error };
}
