'use client';

import { ArrowLeft, Mail, ShieldCheck, User, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { claimDevice, friendlyAuthError, sendRegisterCode, verifyCode } from '@/lib/session/auth-client';
import { AuthCard } from './auth-card';
import { OtpInput } from './otp-input';
import { useOtpCountdown } from './use-otp-countdown';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EXAM_TARGETS = [
  { value: 'ugc_net', label: 'UGC NET Forensic Science' },
  { value: 'msc', label: 'MSc / BSc Forensic Science' },
  { value: 'job', label: 'Government lab / job preparation' },
  { value: 'other', label: 'Other' },
];

/**
 * Registration. Profile details are captured *before* the OTP is sent and
 * passed as options.data, so handle_new_user() writes a complete profile row
 * at account creation â€” no half-finished accounts, no follow-up screen.
 *
 * No phone field: it is collected only at checkout for physical book shipping
 * (docs Part 5 Â§2.1a).
 */
export function RegisterFlow() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [form, setForm] = useState({ fullName: '', email: '', examTarget: 'ugc_net', consent: false });
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const countdown = useOtpCountdown(60);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Enter your full name.';
    if (!EMAIL_RE.test(form.email)) next.email = 'Enter a valid email address.';
    if (!form.consent) next.consent = 'Please accept the Terms and Privacy Policy to continue.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const { error } = await sendRegisterCode({
      email: form.email,
      fullName: form.fullName,
      examTarget: form.examTarget,
    });
    setPending(false);

    if (error) return setErrors({ email: friendlyAuthError(error.message) });

    setStep('code');
    setCode('');
    countdown.start();
  }

  async function resend() {
    countdown.start();
    const { error } = await sendRegisterCode({
      email: form.email,
      fullName: form.fullName,
      examTarget: form.examTarget,
    });
    if (error) setErrors({ code: friendlyAuthError(error.message) });
  }

  async function verify(value: string) {
    setErrors({});
    setPending(true);

    const { error } = await verifyCode(form.email, value);
    if (error) {
      setPending(false);
      setCode('');
      return setErrors({ code: friendlyAuthError(error.message) });
    }

    await claimDevice();

    // Straight into onboarding rather than the dashboard: a brand-new account
    // has no enrolments, so the dashboard would greet them with empty states.
    router.replace('/early-access');
    router.refresh();
  }

  if (step === 'details') {
    return (
      <AuthCard
        icon={UserPlus}
        title="Create your account"
        description="Takes about 30 seconds. No password to remember."
        footer={
          <span className="text-slate-500 text-sm">
            Already have an account?{' '}
            <Link href="/sign-in" className="text-[#451952] font-bold hover:text-[#662549] hover:underline transition-colors">
              Sign in
            </Link>
          </span>
        }
      >
        <form onSubmit={submitDetails} className="flex flex-col gap-3">
          <div>
            <label htmlFor="fullName" className="block text-xs sm:text-sm font-bold text-[#1D1A39] mb-1.5">
              Full name
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-400">
                <User className="size-4.5" />
              </div>
              <input
                id="fullName"
                autoComplete="name"
                autoFocus
                required
                placeholder="Ananya Sharma"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                className="w-full h-11 sm:h-12 pl-11 pr-4 rounded-xl border border-[#E8BCB9]/80 bg-white text-[#1D1A39] text-sm placeholder:text-slate-400 focus:border-[#451952] focus:ring-2 focus:ring-[#451952]/20 outline-none transition-all"
              />
            </div>
            {errors.fullName && <p className="text-red-500 text-xs font-medium mt-1">{errors.fullName}</p>}
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs sm:text-sm font-bold text-[#1D1A39] mb-1.5">
              Email address
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-400">
                <Mail className="size-4.5" />
              </div>
              <input
                id="reg-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full h-11 sm:h-12 pl-11 pr-4 rounded-xl border border-[#E8BCB9]/80 bg-white text-[#1D1A39] text-sm placeholder:text-slate-400 focus:border-[#451952] focus:ring-2 focus:ring-[#451952]/20 outline-none transition-all"
              />
            </div>
            <p className="text-slate-400 text-[11px] mt-1">Your verification code and class reminders go here.</p>
            {errors.email && <p className="text-red-500 text-xs font-medium mt-1">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="examTarget" className="block text-xs sm:text-sm font-bold text-[#1D1A39] mb-1.5">
              What are you preparing for?
            </label>
            <div className="relative">
              <select
                id="examTarget"
                value={form.examTarget}
                onChange={(e) => set('examTarget', e.target.value)}
                className="w-full h-11 sm:h-12 px-3.5 rounded-xl border border-[#E8BCB9]/80 bg-white text-[#1D1A39] text-sm focus:border-[#451952] focus:ring-2 focus:ring-[#451952]/20 outline-none transition-all appearance-none"
              >
                {EXAM_TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

          <div
            className={`mt-0.5 flex items-start gap-2.5 rounded-xl border p-3 transition-colors ${
              errors.consent ? 'border-red-400 bg-red-50/50' : 'border-slate-200/80 bg-slate-50/50'
            }`}
          >
            <input
              type="checkbox"
              id="consent"
              className="mt-0.5 size-4 rounded border-slate-300 text-[#451952] focus:ring-[#451952]"
              checked={form.consent}
              onChange={(e) => set('consent', e.target.checked)}
            />
            <label htmlFor="consent" className="text-slate-600 text-xs leading-relaxed">
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="text-[#451952] font-bold hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="text-[#451952] font-bold hover:underline">
                Privacy Policy
              </Link>
              .
            </label>
          </div>
          {errors.consent && <p className="text-red-500 text-xs font-medium mt-1">{errors.consent}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full h-11 sm:h-12 bg-gradient-to-r from-[#1D1A39] to-[#451952] hover:opacity-95 active:scale-[0.99] text-white rounded-xl font-semibold text-sm sm:text-[15px] shadow-md transition-all mt-1 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {pending ? (
              <span className="h-4.5 w-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Continue</span>
                <span aria-hidden="true">â†’</span>
              </>
            )}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={ShieldCheck}
      title="Verify your email"
      description={
        <>
          We sent a 6-digit code to
          <br />
          <strong className="text-ink">{form.email}</strong>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setErrors((e) => ({ ...e, code: '' }));
          }}
          onComplete={verify}
          disabled={pending}
          invalid={!!errors.code}
        />

        {errors.code && (
          <p className="text-error text-center text-[13px] font-medium" role="alert">
            {errors.code}
          </p>
        )}

        <Button size="lg" block loading={pending} disabled={code.length < 6} onClick={() => verify(code)}>
          Create account
        </Button>

        <div className="text-ink-muted flex items-center justify-center gap-1.5 text-[13px]">
          <span>Didn&apos;t get it?</span>
          {countdown.canResend ? (
            <button onClick={resend} className="text-primary font-semibold hover:underline">
              Resend code
            </button>
          ) : (
            <span className="text-ink-light font-semibold">Resend in {countdown.label}</span>
          )}
        </div>

        <button
          onClick={() => setStep('details')}
          className="text-ink-secondary hover:text-primary mx-auto flex min-h-11 items-center gap-1.5 text-[13px] font-semibold"
        >
          <ArrowLeft className="size-4" aria-hidden /> Edit details
        </button>
      </div>
    </AuthCard>
  );
}
