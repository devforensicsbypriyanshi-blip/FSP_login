import { Bell, Flame, MessageCircle, Sparkles, Youtube } from 'lucide-react';
import Image from 'next/image';

export const metadata = {
  title: 'Coming Soon · Forensic Science by Priyanshi',
  description: 'Our new interactive web application is launching soon.',
};

export default function ComingSoonPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F7] flex flex-col justify-between selection:bg-[#E8BCB9] selection:text-[#1D1A39]">
      {/* Top Header */}
      <header className="w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Forensic Science by Priyanshi"
              className="size-10 rounded-xl object-contain bg-white border border-slate-100 p-0.5 shadow-2xs"
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold tracking-wider text-[#6f6b85] uppercase">
                Forensic Science by
              </span>
              <span className="font-serif text-[17px] font-bold tracking-tight text-[#1D1A39]">
                Priyanshi
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FAF8FC] border border-[#EADBEE] text-xs font-bold text-[#451952]">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Launching Soon</span>
          </div>
        </div>
      </header>

      {/* Main Content Hero */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full flex flex-col gap-8">
        {/* Banner */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-[#1D1A39] via-[#451952] to-[#662549] text-white p-8 sm:p-12 shadow-xl">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 size-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-xs font-bold tracking-wide text-[#E8BCB9] mb-4">
                <Sparkles className="size-3.5 text-[#F59F59]" />
                <span>Web Application In Final Stages</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                Something Big Is Coming Soon! 🚀
              </h1>

              <p className="text-slate-200 text-sm sm:text-base mt-3 leading-relaxed">
                We are crafting an all-new interactive learning experience with high-yield forensic video modules, live sessions, daily practice sets, and mock tests.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-[#E8BCB9]">
                <div className="flex items-center gap-1.5 bg-white/10 px-3.5 py-2 rounded-xl border border-white/10">
                  <Flame className="size-4 text-[#F59F59]" />
                  <span>Target: CUET PG · UGC NET · NFSU</span>
                </div>
              </div>
            </div>

            {/* Target 3D Illustration */}
            <div className="relative shrink-0 flex items-center justify-center self-center md:self-auto w-[160px] sm:w-[200px] aspect-square">
              <Image
                src="/images/target_books.png"
                alt="Target Forensic Science"
                width={200}
                height={200}
                className="object-contain select-none pointer-events-none drop-shadow-md"
                priority
              />
            </div>
          </div>
        </section>

        {/* Community Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="p-6 rounded-2xl border border-slate-200/80 bg-white shadow-2xs flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-[#FAF8F7] border border-[#e6e0df] flex items-center justify-center text-[#451952] mb-3.5">
                <Bell className="size-5" />
              </div>
              <h3 className="font-bold text-sm text-[#1D1A39]">Batch Announcements</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Stay updated on upcoming batch dates, syllabus roadmaps, and course enrollment releases.
              </p>
            </div>
            <span className="mt-4 text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              Opening Soon
            </span>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200/80 bg-white shadow-2xs flex flex-col justify-between">
            <div>
              <div className="size-10 rounded-xl bg-[#FAF8F7] border border-[#e6e0df] flex items-center justify-center text-[#25D366] mb-3.5">
                <MessageCircle className="size-5" />
              </div>
              <h3 className="font-bold text-sm text-[#1D1A39]">WhatsApp Aspirants Club</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Connect with fellow forensic aspirants, receive daily questions, and get direct updates from Priyanshi Ma&apos;am.
              </p>
            </div>
            <a
              href="https://wa.me/919999999999?text=Hi%20Priyanshi%20Ma'am,%20I%20want%20to%20join%20the%20community"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#451952] hover:underline"
            >
              <span>Join WhatsApp Group</span>
              <span>&rarr;</span>
            </a>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200/80 bg-white shadow-2xs flex flex-col justify-between">
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
              <span>&rarr;</span>
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white py-6 px-4 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Forensic Science by Priyanshi. All rights reserved.</p>
      </footer>
    </main>
  );
}
