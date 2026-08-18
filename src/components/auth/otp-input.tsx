'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 6-digit OTP input — the React port of initOtpFields() from js/modals.js,
 * with the behaviours that implementation lacked:
 *   - paste a whole code into any box and it distributes
 *   - Backspace on an empty box steps back
 *   - Arrow keys navigate
 *   - inputMode="numeric" so phones show the number pad
 *   - autoComplete="one-time-code" so iOS/Android autofill from the email
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    const joined = next.join('').slice(0, length);
    onChange(joined);
    if (joined.length === length && !joined.includes('')) onComplete?.(joined);
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (!clean) return setDigit(index, '');

    // Multi-character input = paste or autofill; spread it forward.
    if (clean.length > 1) {
      const merged = (value.slice(0, index) + clean).replace(/\D/g, '').slice(0, length);
      onChange(merged);
      const focusAt = Math.min(merged.length, length - 1);
      refs.current[focusAt]?.focus();
      if (merged.length === length) onComplete?.(merged);
      return;
    }

    setDigit(index, clean);
    if (index < length - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      setDigit(index - 1, '');
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  return (
    <div
      className="flex justify-center gap-2 sm:gap-2.5"
      role="group"
      aria-label={`${length}-digit verification code`}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => {
            setFocused(i);
            e.target.select();
          }}
          onBlur={() => setFocused(null)}
          className={cn(
            'font-display text-ink size-12 rounded-xl border-2 text-center text-xl font-bold transition-all outline-none sm:size-[52px] sm:text-2xl',
            invalid
              ? 'border-error bg-error-bg'
              : focused === i
                ? 'border-primary bg-surface ring-primary/15 ring-[3px]'
                : digit
                  ? 'border-primary-border bg-primary-ultra'
                  : 'border-line-medium bg-surface',
            disabled && 'opacity-60'
          )}
        />
      ))}
    </div>
  );
}
