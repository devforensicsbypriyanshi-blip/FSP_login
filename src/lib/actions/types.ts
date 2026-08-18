/**
 * Shared shapes for Server Action results.
 *
 * They live here rather than beside the actions because a 'use server' module
 * may only export async functions — a type export in one is a build error
 * waiting to happen the first time someone adds `isolatedModules` strictness.
 */

export interface FormState {
  ok: boolean;
  /** Shown once, above the form. */
  message?: string;
  /** Keyed by input name, shown against the field. */
  fieldErrors?: Record<string, string>;
}

export const IDLE_FORM_STATE: FormState = { ok: false };
