import { ArrowRight, Bell, CheckCircle2, Flame, LogOut, MessageCircle, Sparkles, Youtube } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getSessionContext } from '@/lib/session/server';

export const metadata = {
  title: 'Priority Access Confirmed · Forensic Science by Priyanshi',
  description: 'Your early access registration is confirmed.',
};

export default async function EarlyAccessPage() {
  const session = await getSessionContext();
  const studentName = session?.profile?.full_name || session?.user?.email?.split('@')[0] || 'Forensic Aspirant';
  const studentEmail = session?.user?.email || 'your email';
  const targetExam = session?.profile?.exam_target || 'Forensic Science PG / UGC NET';

  return (
    <main className="min-h-screen bg-[#FAF8F7] flex flex-col justify-between selection:bg-[#E8BCB9] selection:text-[#1D1A39]">
      {/* Top Brand Header */}
      <header className="w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="Forensic Science by Priyanshi"
              className="size-10 rounded-xl object-contain bg-white border border-slate-100 p-0.5 shadow-2xs transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[9.5px] font-bold tracking-wider text-[#6f6b85] uppercase">
                Forensic Science by
              </span>
              <span className="font-serif text-[16px] font-bold tracking-tight text-[#1D1A39]">
                Priyanshi
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF8FC] border border-[#EADBEE] text-xs font-semibold text-[#451952]">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Verified Account</span>
            </span>
            <Button asChild variant="ghost" size="sm" className="text-slate-600 hover:text-[#1D1A39]">
              <Link href="/sign-out">
                <LogOut className="size-4 mr-1.5" /> Sign out
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Early Access Hero & Cards */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full flex flex-col gap-8">
        {/* Status Confirmation Banner */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-[#1D1A39] via-[#451952] to-[#662549] text-white p-7 sm:p-10 shadow-lg">
          {/* Subtle Background Glow */}
          <div className="absolute top-0 right-0 -mt-8 -mr-8 size-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold tracking-wide text-[#E8BCB9] mb-4">
                <Sparkles className="size-3.5 text-[#F59F59]" />
                <span>Priority Access Confirmed</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
                Welcome aboard, {studentName}! 🎉
              </h1>

              <p className="text-slate-200 text-sm sm:text-base mt-2.5 leading-relaxed">
                Your account is verified. You are on the priority list for early access to interactive forensic lectures, structured test series, and live classes.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-[#E8BCB9]">
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  <span>Email: {studentEmail}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                  <Flame className="size-4 text-[#F59F59]" />
                  <span>Target: {targetExam}</span>
                </div>
              </div>
            </div>

            {/* Target 3D Illustration */}
            <div className="relative shrink-0 flex items-center justify-center self-center md:self-auto w-[150px] sm:w-[180px] aspect-square">
              <Image
                src="/images/target_books.png"
                alt="Target Forensic Science"
                width={180}
                height={180}
                className="object-contain select-none pointer-events-none drop-shadow-md"
                priority
              />
            </div>
          </div>
        </section>

        {/* What to Expect & Launch Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="p-6 rounded-2xl border-slate-200/80 bg-white shadow-2xs flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-[#FAF8F7] border border-[#e6e0df] flex items-center justify-center text-[#451952] mb-3.5">
                <Bell className="size-5" />
              </div>
              <h3 className="font-bold text-sm text-[#1D1A39]">Batch Notification</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                You will receive an instant email and SMS invitation as soon as the batch enrollments and video modules open.
              </p>
            </div>
            <span className="mt-4 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="size-3.5" /> Notification Active
            </span>
          </Card>

          <Card className="p-6 rounded-2xl border-slate-200/80 bg-white shadow-2xs flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-[#FAF8F7] border border-[#e6e0df] flex items-center justify-center text-[#25D366] mb-3.5">
                <MessageCircle className="size-5" />
              </div>
              <h3 className="font-bold text-sm text-[#1D1A39]">WhatsApp Aspirants Club</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Connect with fellow forensic aspirants, receive daily practice questions, and get instant updates from Priyanshi Ma'am.
              </p>
            </div>
            <a
              href="https://wa.me/919999999999?text=Hi%20Priyanshi%20Ma'am,%20I%20have%20registered%20for%20Early%20Access"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#451952] hover:underline"
            >
              <span>Join WhatsApp Group</span>
              <ArrowRight className="size-3.5" />
            </a>
          </Card>

          <Card className="p-6 rounded-2xl border-slate-200/80 bg-white shadow-2xs flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-[#FAF8F7] border border-[#e6e0df] flex items-center justify-center text-[#FF0000] mb-3.5">
                <Youtube className="size-5" />
              </div>
              <h3 className="font-bold text-sm text-[#1D1A39]">Free Masterclasses</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Watch curated masterclasses, previous year question analyses, and core conceptual breakdowns on YouTube.
              </p>
            </div>
            <a
              href="https://youtube.com/@forensicsciencebypriyanshi"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#451952] hover:underline"
            >
              <span>Watch on YouTube</span>
              <ArrowRight className="size-3.5" />
            </a>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white py-6 px-4 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Forensic Science by Priyanshi. All rights reserved.</p>
      </footer>
    </main>
  );
}
