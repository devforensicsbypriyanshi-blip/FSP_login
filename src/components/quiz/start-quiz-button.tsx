'use client';

import { PlayCircle, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { startAttempt } from '@/lib/actions/quizzes';

/**
 * Starting is a POST, not a link.
 *
 * A GET that creates an attempt would be triggered by Next's link prefetching —
 * hovering the button would silently burn one of a student's three attempts.
 * start_quiz_attempt() also resumes an open attempt rather than creating a
 * second, so a double-click costs nothing.
 */
export function StartQuizButton({
  quizId,
  resume = false,
  disabled = false,
  label,
}: {
  quizId: string;
  resume?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function go() {
    start(async () => {
      const result = await startAttempt(quizId);
      if (!result.ok) {
        toast({ tone: 'error', message: result.message });
        return;
      }
      router.push(`/app/tests/attempt/${result.attemptId}`);
    });
  }

  return (
    <Button size="sm" loading={pending} disabled={disabled} onClick={go}>
      {resume ? <RotateCcw className="size-4" aria-hidden /> : <PlayCircle className="size-4" aria-hidden />}
      {label ?? (resume ? 'Resume attempt' : 'Start quiz')}
    </Button>
  );
}
