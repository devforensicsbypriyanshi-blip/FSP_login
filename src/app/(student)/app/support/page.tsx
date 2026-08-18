import { ArrowLeft, HelpCircle, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';

export const metadata = { title: 'Help & Support' };

const FAQS = [
  {
    q: 'How many devices can I use my account on?',
    a: 'Your account allows 1 active mobile/tablet device and 1 web session at a time to protect course DRM and proprietary study materials.',
  },
  {
    q: 'What should I do if a live class video does not load?',
    a: 'Check your internet connection and ensure third-party cookies are allowed for Google Meet/Drive stream player. You can also re-login to refresh your session tokens.',
  },
  {
    q: 'Can I download the notes and DPPs?',
    a: 'Study notes and DPPs are DRM-protected and viewable securely inside the platform reader without downloads or screenshots.',
  },
  {
    q: 'How do I reschedule a 1:1 mentorship booking?',
    a: 'Go to 1:1 Mentorship in your dashboard to view your booking. You can reschedule up to 4 hours before the session start time.',
  },
];

export default function StudentSupportPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-600 hover:text-[#1D1A39] mb-1">
          <Link href="/app">
            <ArrowLeft className="size-4" aria-hidden /> Back to Dashboard
          </Link>
        </Button>
        <PageHeader
          title="Student Help & Support"
          description="We are here to help with your classes, test access, notes, and technical queries."
        />
      </div>

      {/* 3 Quick Contact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#FAF8F7] border border-[#e6e0df] text-[#451952] mb-3">
              <MessageCircle className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-[#1D1A39]">WhatsApp Support</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Instant assistance for login, access issues, and batch enrollments.
            </p>
          </div>
          <a
            href="https://wa.me/919999999999?text=Hi%20Forensic%20Science%20Team%2C%20I%20need%20assistance"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#451952] hover:underline"
          >
            <span>Chat on WhatsApp</span>
            <span>&rarr;</span>
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#FAF8F7] border border-[#e6e0df] text-[#662549] mb-3">
              <Mail className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-[#1D1A39]">Email Desk</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Detailed technical queries, invoice requests, and course inquiries.
            </p>
          </div>
          <a
            href="mailto:support@forensicbypriyanshi.com"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#451952] hover:underline"
          >
            <span>support@forensicbypriyanshi.com</span>
            <span>&rarr;</span>
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#FAF8F7] border border-[#e6e0df] text-[#AF445A] mb-3">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="font-bold text-sm text-[#1D1A39]">Session & Device Reset</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Facing device eviction? Clear active sessions from account settings.
            </p>
          </div>
          <Link
            href="/app/settings"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#451952] hover:underline"
          >
            <span>Manage Devices</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </div>

      {/* Ticket Submission Form & FAQs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket Form */}
        <Card className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xs">
          <CardHeader>
            <CardTitle className="text-[#1D1A39] text-base font-bold">Raise a Support Ticket</CardTitle>
            <Badge variant="purple">Average response: &lt; 2 hrs</Badge>
          </CardHeader>

          <form className="flex flex-col gap-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Your Name" htmlFor="name">
                <Input id="name" defaultValue="Ananya Sharma" className="rounded-xl border-slate-200" />
              </Field>
              <Field label="Category" htmlFor="category">
                <select
                  id="category"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#451952]"
                >
                  <option value="playback">Video Playback / Live Stream</option>
                  <option value="test">Mock Test / Quiz Grading</option>
                  <option value="notes">Notes &amp; DPP Access</option>
                  <option value="mentorship">1:1 Mentorship Session</option>
                  <option value="billing">Billing &amp; Receipt</option>
                  <option value="other">Other Inquiry</option>
                </select>
              </Field>
            </div>

            <Field label="Subject" htmlFor="subject">
              <Input
                id="subject"
                placeholder="e.g. Unable to open DNA Profiling DPP Set 3"
                className="rounded-xl border-slate-200 focus:border-[#451952]"
              />
            </Field>

            <Field label="Describe the issue" htmlFor="details" hint="Include course title or error message if any">
              <Textarea
                id="details"
                rows={4}
                placeholder="Please describe what happened..."
                className="rounded-xl border-slate-200 focus:border-[#451952]"
              />
            </Field>

            <Button
              type="button"
              className="self-start bg-[#1D1A39] hover:bg-[#2A244E] text-white font-semibold rounded-xl px-5 py-2.5 shadow-2xs"
            >
              Submit Ticket
            </Button>
          </form>
        </Card>

        {/* FAQs */}
        <div className="flex flex-col gap-3">
          <h3 className="font-bold text-sm text-[#1D1A39] flex items-center gap-2">
            <HelpCircle className="size-4 text-[#451952]" />
            <span>Frequently Asked Questions</span>
          </h3>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <p className="text-xs font-bold text-[#1D1A39] leading-snug">{faq.q}</p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
