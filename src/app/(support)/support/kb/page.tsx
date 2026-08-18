import { Card, PageHeader } from '@/components/ui/card';

export const metadata = { title: 'Knowledge Base' };

const ARTICLES: [string, string][] = [
  [
    'I did not receive my login code',
    'Check spam, confirm the address, then resend from the account helper.',
  ],
  ['Video shows "permission denied"', 'The Drive file is not shared as "Anyone with the link".'],
  ['I was signed out during class', 'Someone signed in on another device — only one is allowed at a time.'],
  ['Join button is greyed out', 'Join links open 15 minutes before the scheduled start.'],
];

export default function Page() {
  return (
    <>
      <PageHeader title="Knowledge base" description="Answers to the most common student questions." />

      <div className="grid gap-3 sm:grid-cols-2">
        {ARTICLES.map(([q, a]) => (
          <Card key={q} hover>
            <h2 className="text-ink font-semibold">{q}</h2>
            <p className="text-ink-muted mt-1 text-[13px] leading-relaxed">{a}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
