import { BookOpen, Megaphone, MoreVertical, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getMyCourses } from '@/lib/data/courses';
import { getSessionContext } from '@/lib/session/server';
import { createClient } from '@/lib/supabase/server';

async function getAnnouncements() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, published_at')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(3);
    if (data && data.length > 0) return data;
  } catch {
    // Fallback if supabase is unreachable or tables empty
  }

  // Guaranteed fallback announcements matching brand guidelines
  return [
    {
      id: 'ann-1',
      title: 'CUET PG 2026 Batch Orientation',
      body: 'Live interactive roadmap session this Monday at 7:00 PM with Priyanshi Jain.',
      published_at: new Date().toISOString(),
    },
    {
      id: 'ann-2',
      title: 'New DPPs: Forensic Biology & Serology',
      body: 'Practice 50 high-yield questions with structured answer keys now available in Notes.',
      published_at: new Date().toISOString(),
    },
    {
      id: 'ann-3',
      title: '1:1 Mentorship Slots Open for August',
      body: 'Book your personal strategy call for entrance exam readiness and career guidance.',
      published_at: new Date().toISOString(),
    },
  ];
}

export default async function StudentHomePage() {
  const session = await getSessionContext();

  const [courses, announcements] = await Promise.all([
    session ? getMyCourses(session.userId) : Promise.resolve([]),
    getAnnouncements(),
  ]);

  const continueCourse = courses
    .filter((c) => c.lessonsTotal > 0 && c.progress < 100)
    .sort((a, b) => b.progress - a.progress)[0];

  const firstName = session?.fullName.split(' ')[0] ?? 'Ananya';

  const mockContinue = continueCourse || {
    title: 'Forensic Biology',
    subtitle: 'Lesson 14: STR DNA Profiling',
    progress: 0,
    lessonsDone: 0,
    lessonsTotal: 10,
    slug: 'forensic-biology',
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* ---------------- 1. Motivational Hero Banner with Integrated Welcome ---------------- */}
      <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#FAF8FC] via-[#F6F0FA] to-[#F2E8F8] border border-[#EADBEE]/80 px-6 py-6 sm:px-8 sm:py-7 shadow-xs">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          {/* Left Content */}
          <div className="flex flex-col max-w-lg">
            {/* Integrated Welcome Greeting Tag */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#451952]/10 text-[#451952] text-xs font-bold tracking-wide">
                <span>Welcome back, {firstName}!</span>
                <span>👋</span>
              </span>
              <span className="text-slate-400 text-xs hidden sm:inline">·</span>
              <span className="text-slate-500 text-xs font-normal hidden sm:inline">
                Learn, practice &amp; grow every day
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-[25px] font-bold text-[#1D1A39] leading-[1.25] tracking-tight">
              Every chapter you study
              <br />
              <span className="text-[#451952] font-extrabold">brings you closer to your goal.</span>
            </h1>

            <p className="text-slate-600 text-xs sm:text-sm mt-2 font-normal">
              Small steps today, big results tomorrow.
            </p>

            <Link
              href="/app/learning"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-[#451952] hover:bg-[#34133e] active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-xs transition-all w-fit"
            >
              <span>Explore My Learning</span>
              <span>&rarr;</span>
            </Link>
          </div>

          {/* Right 3D Target Illustration */}
          <div className="relative shrink-0 flex items-center justify-center self-center md:self-auto w-[160px] sm:w-[190px] lg:w-[210px] aspect-square">
            <Image
              src="/images/target_books.png"
              alt="Forensic Science Target"
              width={210}
              height={210}
              className="object-contain select-none pointer-events-none drop-shadow-sm"
              priority
            />
          </div>
        </div>
      </section>

      {/* ---------------- 3. Bottom Content: Continue Learning + Announcements ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Continue Learning Section */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-[15px] font-bold text-[#1D1A39] tracking-tight flex items-center gap-2">
              <BookOpen className="size-4 text-[#1D1A39]" />
              <span>Continue Learning</span>
            </h2>
            <Link
              href="/app/learning"
              className="text-[#6D28D9] hover:text-[#5B21B6] text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <span>View all</span>
              <span>&rarr;</span>
            </Link>
          </div>

          <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs hover:border-slate-300 transition-all">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Course Thumbnail */}
              <div className="relative size-20 sm:size-22 rounded-xl bg-[#1D1A39] p-3 flex flex-col justify-between shrink-0 shadow-2xs text-white">
                <span className="font-display text-xs font-bold leading-tight">
                  {mockContinue.title}
                </span>
                <span className="text-[10px] text-white/60 font-medium uppercase tracking-wider">
                  Course
                </span>
              </div>

              {/* Course Info & Progress */}
              <div className="flex flex-1 flex-col min-w-0 gap-1.5 w-full">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[#1D1A39] text-sm sm:text-base font-bold truncate">
                    {mockContinue.subtitle ?? mockContinue.title}
                  </h3>
                  <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                    <MoreVertical className="size-4" />
                  </button>
                </div>

                <p className="text-slate-500 text-xs font-medium">
                  {mockContinue.lessonsDone} of {mockContinue.lessonsTotal} lessons complete
                </p>

                {/* Progress Bar */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-semibold text-slate-700">{mockContinue.progress}%</span>
                  <div className="flex-1">
                    <Progress value={mockContinue.progress} className="h-1.5 bg-slate-100" showValue={false} />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{mockContinue.progress}%</span>
                </div>
              </div>

              {/* Resume CTA */}
              <div className="sm:self-center shrink-0 w-full sm:w-auto mt-1 sm:mt-0">
                <Link
                  href={`/app/learning/${mockContinue.slug}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D1A39] hover:bg-[#2A244E] active:scale-[0.98] text-white text-xs sm:text-sm font-semibold shadow-2xs transition-all"
                >
                  <Play className="size-3.5 fill-current" />
                  <span>Resume</span>
                </Link>
              </div>
            </div>
          </Card>
        </section>

        {/* Announcements Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-[15px] font-bold text-[#1D1A39] tracking-tight flex items-center gap-2">
              <Megaphone className="size-4 text-[#1D1A39]" />
              <span>Announcements</span>
            </h2>
          </div>

          <Card className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs flex flex-col justify-between gap-3 h-full divide-y divide-slate-100">
            {announcements.map((a, idx) => (
              <div key={a.id} className={idx > 0 ? 'pt-3' : ''}>
                <h3 className="text-[#1D1A39] text-xs sm:text-[13px] font-bold leading-snug">
                  {a.title}
                </h3>
                <p className="text-slate-500 text-xs font-normal leading-relaxed mt-1 line-clamp-2">
                  {a.body}
                </p>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
