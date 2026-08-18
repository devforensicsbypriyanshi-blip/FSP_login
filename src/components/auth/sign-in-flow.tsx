'use client';

import { ArrowLeft, Mail, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { claimDevice, friendlyAuthError, sendSignInCode, verifyCode } from '@/lib/session/auth-client';
import { SIGNED_OUT_ELSEWHERE } from '@/lib/session/constants';
import { AuthCard } from './auth-card';
import { OtpInput } from './otp-input';
import { useOtpCountdown } from './use-otp-countdown';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email â†’ OTP sign-in. No password, no Google, no phone (docs Part 5 Â§1).
 *
 * After verification the browser claims the device, which evicts any other live
 * session. That claim is deliberately non-fatal: the user is authenticated by
 * then, so failing to write an audit row must not strand them on this screen.
 * Middleware re-checks on the very next request regardless.
 */
export function SignInFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next');
  const wasSignedOut = params.get('reason') === SIGNED_OUT_ELSEWHERE;

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const countdown = useOtpCountdown(60);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.');

    setError(undefined);
    setPending(true);

    const { error: sendError } = await sendSignInCode(email);
    setPending(false);

    if (sendError) return setError(friendlyAuthError(sendError.message));

    setStep('code');
    setCode('');
    countdown.start();
  }

  async function verify(value: string) {
    setError(undefined);
    setPending(true);

    const { error: verifyError } = await verifyCode(email, value);
    if (verifyError) {
      setPending(false);
      setCode('');
      return setError(friendlyAuthError(verifyError.message));
    }

    await claimDevice();

    // `next` comes from the URL, so it is user-editable. Only same-origin paths
    // are honoured â€” a full URL here would be an open redirect.
    const safeNext = nextPath?.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/early-access';
    router.replace(safeNext);
    router.refresh();
  }

  if (step === 'email') {
    return (
      <AuthCard
        icon={Mail}
        title="Welcome back"
        description="Sign in to continue your learning journey."
        footer={
          <span className="text-slate-500 text-sm">
            New here?{' '}
            <Link href="/register" className="text-[#451952] font-bold hover:text-[#662549] hover:underline transition-colors">
              Create an account
            </Link>
          </span>
        }
      >
        {wasSignedOut && (
          <div
            className="border border-[#E8BCB9] bg-[#F9F0EF] text-[#1D1A39] mb-4 flex items-start gap-2.5 rounded-xl p-3 text-xs leading-relaxed"
            role="status"
          >
            <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-[#662549]" aria-hidden />
            <span>
              You were signed out because your account was used on another device. Only one device can be
              signed in at a time.
            </span>
          </div>
        )}

        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <div>
            <label htmlFor="email" className="block text-xs sm:text-sm font-bold text-[#1D1A39] mb-1.5">
              Email address
            </label>
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-400">
                <Mail className="size-4.5" />
              </div>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(undefined);
                }}
                className="w-full h-11 sm:h-12 pl-11 pr-4 rounded-xl border border-[#e6e0df] bg-white text-[#1D1A39] text-sm placeholder:text-slate-400 focus:border-[#451952] focus:ring-2 focus:ring-[#451952]/20 outline-none transition-all"
              />
            </div>
            {error && <p className="text-red-500 text-xs font-medium mt-1">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full h-11 sm:h-12 bg-gradient-to-r from-[#1D1A39] to-[#451952] hover:opacity-95 active:scale-[0.99] text-white rounded-xl font-semibold text-sm sm:text-[15px] shadow-md transition-all mt-0.5 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {pending ? (
              <span className="h-4.5 w-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Send code</span>
                <span aria-hidden="true">â†’</span>
              </>
            )}
          </button>

          {/* OR Divider */}
          <div className="relative my-1 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200/70" />
            </div>
            <span className="relative bg-white px-2.5 text-[10px] sm:text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              OR
            </span>
          </div>

          {/* Bypass Login CTA */}
          <Link
            href="/app"
            className="w-full py-2.5 px-3.5 rounded-xl border border-[#e6e0df] bg-[#FAF8F7] hover:bg-[#F9F0EF] hover:border-[#E8BCB9] text-[#1D1A39] font-bold text-xs sm:text-[13px] transition-all flex items-center justify-center gap-2 shadow-2xs"
          >
            <ShieldCheck className="size-4 text-[#451952]" />
            <span>Bypass Login &amp; Open Student Dashboard</span>
          </Link>

          {/* Security Callout */}
          <div className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl bg-[#FAF8F7] border border-[#f2eeed] text-left mt-0.5">
            <ShieldCheck className="size-4.5 text-[#451952] shrink-0" />
            <p className="text-[#6f6b85] text-[11px] sm:text-xs leading-relaxed">
              One device at a time. Signing in here will safely claim your session.
            </p>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={ShieldCheck}
      title="Enter your code"
      description={
        <>
          We sent a 6-digit code to
          <br />
          <strong className="text-[#1D1A39] font-semibold">{email}</strong>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(undefined);
          }}
          onComplete={verify}
          disabled={pending}
          invalid={!!error}
        />

        {error && (
          <p className="text-red-500 text-center text-xs font-medium" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={() => verify(code)}
          disabled={code.length < 6 || pending}
          className="w-full h-11 sm:h-12 bg-gradient-to-r from-[#1D1A39] to-[#451952] hover:opacity-95 active:scale-[0.99] text-white rounded-xl font-semibold text-sm sm:text-[15px] shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {pending ? (
            <span className="h-4.5 w-4.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Verify &amp; continue</span>
              <span aria-hidden="true">â†’</span>
            </>
          )}
        </button>

        <div className="text-slate-500 flex items-center justify-center gap-1.5 text-xs">
          <span>Didn&apos;t get it?</span>
          {countdown.canResend ? (
            <button onClick={() => sendCode()} className="text-[#451952] font-bold hover:underline">
              Resend code
            </button>
          ) : (
            <span className="text-slate-400 font-medium">Resend in {countdown.label}</span>
          )}
        </div>

        <button
          onClick={() => {
            setStep('email');
            setCode('');
            setError(undefined);
          }}
          className="text-slate-500 hover:text-[#451952] mx-auto flex items-center gap-1.5 text-xs font-semibold pt-1 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden /> Use a different email
        </button>
      </div>
    </AuthCard>
  );
}
