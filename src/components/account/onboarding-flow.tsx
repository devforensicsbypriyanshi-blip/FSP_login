'use client';

import { Bell, BellRing, Check, GraduationCap, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { completeOnboarding } from '@/lib/actions/profile';
import { enablePush } from '@/lib/notifications/push-client';
import { cn } from '@/lib/utils';

/**
 * Three steps, every one skippable.
 *
 * The account already exists by the time anyone lands here — registration wrote
 * a complete profile row. So this is orientation, not a gate: someone who wants
 * to get straight to their course should never be blocked by it.
 *
 * Step 3 is where the push permission is requested, in context and after an
 * explanation. Asking on first load is how you get a permanent "Block", and on
 * iOS it silently fails altogether unless the app was installed to the home
 * screen first — which is exactly what the copy there says.
 */

const EXAM_TARGETS = [
  { value: 'ugc_net', label: 'UGC NET Forensic Science' },
  { value: 'msc', label: 'MSc / BSc Forensic Science' },
  { value: 'job', label: 'Government lab / job preparation' },
  { value: 'other', label: 'Still deciding' },
];

const STEPS = ['You', 'How it works', 'Reminders'];

export function OnboardingFlow({
  initialName,
  initialTarget,
}: {
  initialName: string;
  initialTarget: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [target, setTarget] = useState(initialTarget ?? 'ugc_net');
  const [pushState, setPushState] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [pushMessage, setPushMessage] = useState<string>();

  function finish() {
    startTransition(async () => {
      await completeOnboarding(name, target);
      router.replace('/app');
      router.refresh();
    });
  }

  async function askForNotifications() {
    const result = await enablePush();

    if (result.ok) {
      setPushState('granted');
      return;
    }

    setPushMessage(result.message);
    setPushState(result.reason === 'denied' ? 'denied' : 'unsupported');
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <div
              className={cn('h-1 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-line')}
              aria-hidden
            />
            <span className={cn('text-[11px]', i <= step ? 'text-primary font-semibold' : 'text-ink-light')}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="border-line-medium bg-surface rounded-3xl border p-6 shadow-xl sm:p-8">
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <header className="text-center">
              <span className="bg-primary-light text-primary mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
                <GraduationCap className="size-7" aria-hidden />
              </span>
              <h1 className="font-display text-ink text-xl font-bold">Let&apos;s set you up</h1>
              <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                Two quick questions so we can point you at the right material.
              </p>
            </header>

            <Field label="What should we call you?" htmlFor="ob-name" required>
              <Input
                id="ob-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>

            <Field label="What are you preparing for?" htmlFor="ob-target">
              <Select id="ob-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                {EXAM_TARGETS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Button size="lg" block disabled={name.trim().length < 2} onClick={() => setStep(1)}>
              Continue
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <header className="text-center">
              <span className="bg-success-bg text-success mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
                <ShieldCheck className="size-7" aria-hidden />
              </span>
              <h1 className="font-display text-ink text-xl font-bold">Two things worth knowing</h1>
            </header>

            <ul className="flex flex-col gap-4">
              <li className="flex gap-3">
                <Check className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
                <p className="text-ink-secondary text-[13.5px] leading-relaxed">
                  <strong className="text-ink">No password.</strong> Every time you sign in we email you a
                  six-digit code. Keep access to your email and you can never be locked out.
                </p>
              </li>
              <li className="flex gap-3">
                <Check className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
                <p className="text-ink-secondary text-[13.5px] leading-relaxed">
                  <strong className="text-ink">One device at a time.</strong> Signing in on your phone signs
                  you out on your laptop. That is deliberate — it keeps shared accounts from spreading.
                </p>
              </li>
            </ul>

            <div className="flex gap-3">
              <Button variant="outline" size="lg" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
                Got it
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <header className="text-center">
              <span className="bg-primary-light text-primary mx-auto mb-4 grid size-14 place-items-center rounded-2xl">
                {pushState === 'granted' ? (
                  <BellRing className="size-7" aria-hidden />
                ) : (
                  <Bell className="size-7" aria-hidden />
                )}
              </span>
              <h1 className="font-display text-ink text-xl font-bold">Never miss a class</h1>
              <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                We&apos;ll remind you the day before each live class, and again fifteen minutes before it
                starts. You can turn this off later in settings.
              </p>
            </header>

            {pushState === 'granted' && (
              <p
                className="border-success-border bg-success-bg text-success rounded-xl border p-3 text-center text-[13px]"
                role="status"
              >
                Reminders are on for this device.
              </p>
            )}
            {pushState === 'denied' && (
              <p
                className="border-warning-border bg-warning-bg text-warning rounded-xl border p-3 text-[13px] leading-relaxed"
                role="status"
              >
                {pushMessage ??
                  'Notifications are blocked in your browser settings. You will still get every reminder by email, so nothing is lost.'}
              </p>
            )}
            {pushState === 'unsupported' && (
              <p className="border-line-medium text-ink-muted rounded-xl border p-3 text-[13px] leading-relaxed">
                {pushMessage ??
                  'This browser cannot show notifications. On an iPhone, add this site to your home screen first — Safari only allows them for installed apps.'}{' '}
                Email reminders work either way.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {pushState === 'idle' && (
                <Button size="lg" block onClick={askForNotifications}>
                  <Bell className="size-4" aria-hidden /> Turn on reminders
                </Button>
              )}
              <Button
                size="lg"
                block
                variant={pushState === 'idle' ? 'outline' : 'primary'}
                loading={pending}
                onClick={finish}
              >
                {pushState === 'idle' ? 'Skip for now' : 'Go to my dashboard'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {step < 2 && (
        <button
          onClick={finish}
          disabled={pending}
          className="text-ink-muted hover:text-primary mx-auto min-h-11 text-[13px] font-semibold"
        >
          Skip setup
        </button>
      )}
    </div>
  );
}
