'use client';

import { useCallback, useEffect, useState } from 'react';

/** Resend cooldown timer. Seconds remaining, plus a restart handle. */
export function useOtpCountdown(seconds = 60) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  const label = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return { remaining, start, label, canResend: remaining === 0 };
}
