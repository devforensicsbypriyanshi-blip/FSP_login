import { ArrowRight, CheckCircle2, MessageCircle, Youtube } from 'lucide-react';
import Image from 'next/image';

export const metadata = {
  title: 'Forensic Science by Priyanshi · Learning Portal Coming Soon',
  description: 'The official digital learning portal for Forensic Science by Priyanshi is launching soon.',
};

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F7] text-[#1D1A39] flex flex-col justify-between selection:bg-[#E8BCB9] selection:text-[#1D1A39]">
      {/* Top Navbar */}
      <header className="w-full bg-white border-b border-slate-100 sticky top-0 z-30 px-6 sm:px-12 py-3.5 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo.png"
              alt="Forensic Science by Priyanshi"
              className="size-10 rounded-2xl object-contain bg-white border border-slate-100 p-1 shadow-2xs"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold tracking-[0.18em] text-[#6f6b85] uppercase">
                Forensic Science by
              </span>
              <span className="font-serif text-lg font-bold tracking-tight text-[#1D1A39]">
                Priyanshi
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FAF8FC] border border-[#EADBEE] text-xs font-bold text-[#451952]">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Platform Launching Soon</span>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10 w-full flex flex-col items-center text-center my-auto">
        {/* Headline */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#1D1A39] tracking-tight leading-[1.15] max-w-3xl">
          Master Forensic Science with{' '}
          <span className="bg-gradient-to-r from-[#451952] via-[#662549] to-[#AF445A] bg-clip-text text-transparent">
            India&apos;s Top Faculty
          </span>
        </h1>

        {/* Subtext */}
        <p className="text-slate-600 text-sm sm:text-base lg:text-lg max-w-2xl mt-3.5 leading-relaxed font-normal">
          We are putting the final touches on your all-in-one learning dashboard — structured video lectures, DRM study notes, mock tests, and 1:1 mentorship.
        </p>

        {/* Target Exams Pill Bar */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 text-xs font-semibold text-slate-700">
          <span className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[#451952]" /> CUET PG Forensic Science
          </span>
          <span className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[#451952]" /> UGC NET / JRF Forensic Science
          </span>
          <span className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[#451952]" /> NFSU &amp; State University Entrances
          </span>
        </div>

        {/* Community Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mt-8 sm:mt-10 w-full max-w-3xl text-left">
          {/* WhatsApp Card */}
          <a
            href="https://wa.me/919999999999?text=Hi%20Priyanshi%20Ma%27am%2C%20I%20want%20to%20join%20the%20Forensic%20Science%20community"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-[#451952]/40 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="size-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#25D366] mb-3.5">
                <MessageCircle className="size-5" />
              </div>
              <h2 className="font-bold text-base text-[#1D1A39] group-hover:text-[#451952] transition-colors">
                Join WhatsApp Study Community
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                Get daily high-yield MCQs, batch updates, syllabus roadmaps, and direct announcements from Priyanshi Ma&apos;am.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#451952] group-hover:underline">
              <span>Connect on WhatsApp</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </a>

          {/* YouTube Card */}
          <a
            href="https://youtube.com/@forensicsciencebypriyanshi"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-[#AF445A]/40 hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="size-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-[#FF0000] mb-3.5">
                <Youtube className="size-5" />
              </div>
              <h2 className="font-bold text-base text-[#1D1A39] group-hover:text-[#AF445A] transition-colors">
                Watch Free Masterclasses
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                Access free conceptual breakdowns, previous year paper discussions, and forensic biology masterclasses on YouTube.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#AF445A] group-hover:underline">
              <span>Explore YouTube Channel</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </div>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white py-4 sm:py-5 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <p>&copy; {new Date().getFullYear()} Forensic Science by Priyanshi. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-500 text-xs font-medium">
            <span>CUET PG</span>
            <span>·</span>
            <span>UGC NET</span>
            <span>·</span>
            <span>NFSU</span>
          </div>
        </div>
      </footer>
    </div>
  );
}