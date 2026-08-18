import { BookOpen, Shield, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh lg:h-dvh flex-col lg:flex-row bg-[#1D1A39] text-white lg:overflow-hidden">
      {/* ---------------- Left Column: Dark Brand Hero ---------------- */}
      <section className="relative flex flex-1 flex-col justify-between p-6 sm:p-8 lg:p-10 xl:p-12 lg:max-w-[50%] xl:max-w-[48%] overflow-hidden bg-[#1D1A39]">
        {/* Subtle decorative dot pattern at bottom left */}
        <div
          className="pointer-events-none absolute -bottom-10 -left-10 size-80 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(#E8BCB9 1.5px, transparent 1.5px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Ambient subtle glow — Plum, not generic purple */}
        <div className="pointer-events-none absolute top-1/4 -left-20 size-96 rounded-full bg-[#451952]/25 blur-3xl" />

        <div className="relative z-10">
          {/* Logo Brand Header */}
          <Link href="/" className="inline-flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="Forensic Science by Priyanshi"
              className="size-11 rounded-xl object-contain bg-white/10 p-1 shadow-md transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold tracking-[0.18em] text-[#E8BCB9]/80 uppercase">
                Forensic Science by
              </span>
              <span className="font-serif text-lg font-bold tracking-tight text-[#E8BCB9]">
                Priyanshi
              </span>
            </div>
          </Link>

          {/* Hero Typography — DM Serif Display for editorial voice */}
          <div className="mt-8 lg:mt-10">
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[40px] font-normal leading-[1.18] tracking-tight text-white">
              Guiding Today,
              <br />
              Building <span className="text-[#E8BCB9] italic font-serif">Tomorrow.</span>
            </h1>

            {/* Wine divider — per brand guidelines, Wine for dividers */}
            <div className="w-10 h-1 bg-[#662549] rounded-full mt-3 mb-4" />

            <p className="text-white/70 text-sm sm:text-[15px] font-normal leading-relaxed max-w-md">
              Your trusted mentor for a successful career in Forensic Science.
            </p>
          </div>

          {/* 3 Feature Highlights */}
          <div className="mt-6 sm:mt-8 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="size-10 rounded-full bg-[#451952]/60 border border-[#662549]/30 text-[#E8BCB9] flex items-center justify-center shrink-0 shadow-inner">
                <User className="size-4.5" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Expert Mentorship</h2>
                <p className="text-white/60 text-xs mt-0.5 leading-relaxed">
                  Personalized guidance by Forensic Expert Priyanshi Jain.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="size-10 rounded-full bg-[#451952]/60 border border-[#662549]/30 text-[#E8BCB9] flex items-center justify-center shrink-0 shadow-inner">
                <BookOpen className="size-4.5" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Exam &amp; Career Preparation</h2>
                <p className="text-white/60 text-xs mt-0.5 leading-relaxed">
                  CUET, AIFSET &amp; more. Stay ahead with exam-focused preparation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="size-10 rounded-full bg-[#451952]/60 border border-[#662549]/30 text-[#E8BCB9] flex items-center justify-center shrink-0 shadow-inner">
                <ShieldCheck className="size-4.5" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Trusted by Thousands</h2>
                <p className="text-white/60 text-xs mt-0.5 leading-relaxed">
                  Join 10,000+ aspirants building their dream careers.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Badge */}
        <div className="relative z-10 mt-6 pt-3 flex items-center gap-2 text-white/45 text-xs">
          <Shield className="size-3.5 text-[#E8BCB9]/70" />
          <span>Secure. Private. Trusted.</span>
        </div>
      </section>

      {/* ---------------- Right Column: White Canvas & Floating Form ---------------- */}
      <section className="relative flex flex-1 flex-col justify-center items-center bg-white lg:rounded-l-[48px] p-6 sm:p-8 lg:p-12 shadow-2xl overflow-y-auto lg:overflow-hidden">
        <main className="w-full max-w-[420px] my-auto py-4">
          {children}
        </main>
      </section>
    </div>
  );
}
