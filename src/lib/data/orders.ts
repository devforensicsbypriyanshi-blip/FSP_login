import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * Order reads.
 *
 * `orders: read own or staff` means the same functions serve the student's
 * receipt list and the admin transactions table — the database decides which
 * rows come back, so there is no role branch here to get wrong.
 */

export interface OrderItem {
  title: string;
  unitPriceInr: number;
  quantity: number;
}

export interface Order {
  id: string;
  status: string;
  subtotalInr: number;
  discountInr: number;
  totalInr: number;
  gatewayOrderId: string | null;
  createdAt: string;
  items: OrderItem[];
  buyerName: string | null;
  buyerEmail: string | null;
  paymentId: string | null;
  method: string | null;
}

const COLUMNS =
  'id, status, subtotal_inr, discount_inr, total_inr, gateway_order_id, created_at, order_items(title_snapshot, unit_price_inr, quantity), profiles(full_name, email), payments(gateway_payment_id, method)';

interface OrderRow {
  id: string;
  status: string;
  subtotal_inr: number;
  discount_inr: number;
  total_inr: number;
  gateway_order_id: string | null;
  created_at: string;
  order_items: { title_snapshot: string; unit_price_inr: number; quantity: number }[] | null;
  profiles: { full_name: string; email: string } | null;
  payments: { gateway_payment_id: string; method: string | null }[] | null;
}

function toOrder(row: OrderRow): Order {
  const payment = row.payments?.[0] ?? null;

  return {
    id: row.id,
    status: row.status,
    subtotalInr: row.subtotal_inr,
    discountInr: row.discount_inr,
    totalInr: row.total_inr,
    gatewayOrderId: row.gateway_order_id,
    createdAt: row.created_at,
    items: (row.order_items ?? []).map((item) => ({
      title: item.title_snapshot,
      unitPriceInr: item.unit_price_inr,
      quantity: item.quantity,
    })),
    buyerName: row.profiles?.full_name ?? null,
    buyerEmail: row.profiles?.email ?? null,
    paymentId: payment?.gateway_payment_id ?? null,
    method: payment?.method ?? null,
  };
}

export async function getOrders(limit = 100): Promise<Order[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('orders')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data as unknown as OrderRow[]).map(toOrder);
}

export async function getOrder(id: string): Promise<Order | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('orders').select(COLUMNS).eq('id', id).maybeSingle();

  if (error || !data) return null;
  return toOrder(data as unknown as OrderRow);
}

export interface CatalogueCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  priceInr: number;
  mrpInr: number | null;
  isFree: boolean;
  studentCount: number;
  lessonCount: number;
  owned: boolean;
}

/** The buyable catalogue, with what the student already owns marked. */
export async function getCatalogue(userId: string | null): Promise<CatalogueCourse[]> {
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('id, slug, title, subtitle, category, price_inr, mrp_inr, is_free, student_count')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('price_inr');

  if (!courses?.length) return [];

  const ids = courses.map((c) => c.id);

  const [{ data: lessons }, { data: enrolments }] = await Promise.all([
    supabase.from('lessons').select('id, course_id').in('course_id', ids).is('deleted_at', null),
    userId
      ? supabase.from('enrollments').select('course_id').eq('user_id', userId).eq('status', 'active')
      : Promise.resolve({ data: [] as { course_id: string }[] }),
  ]);

  const lessonCount = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    lessonCount.set(lesson.course_id, (lessonCount.get(lesson.course_id) ?? 0) + 1);
  }

  const owned = new Set((enrolments ?? []).map((e) => e.course_id));

  return courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    title: course.title,
    subtitle: course.subtitle,
    category: course.category,
    priceInr: course.price_inr,
    mrpInr: course.mrp_inr,
    isFree: course.is_free ?? course.price_inr === 0,
    studentCount: course.student_count,
    lessonCount: lessonCount.get(course.id) ?? 0,
    owned: owned.has(course.id),
  }));
}
