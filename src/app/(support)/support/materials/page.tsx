import { FileText, Link2, Send, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, PageHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';

export const metadata = { title: 'Study Materials' };

/**
 * Client feedback (2026-08-06): support needs to manage content, not just
 * answer tickets — upload and remove study material, and share notes with
 * students.
 *
 * Permission boundary: support may add and retire material and share existing
 * material. They may NOT edit course structure, pricing or enrolments — those
 * stay with admin and educator. That keeps a helpdesk account from being able
 * to give away paid content.
 */

const MATERIALS = [
  {
    id: '1',
    title: 'Unit 3: Forensic Serology & DNA Extraction',
    course: 'UGC NET 2026 Core',
    kind: 'Note',
    added: '2 Aug',
    linked: true,
  },
  {
    id: '2',
    title: 'DPP #18: Questioned Documents',
    course: 'UGC NET 2026 Core',
    kind: 'DPP',
    added: '4 Aug',
    linked: true,
  },
  {
    id: '3',
    title: 'Chromatography — handwritten notes',
    course: 'Ballistics Masterclass',
    kind: 'Note',
    added: '5 Aug',
    linked: false,
  },
];

export default function SupportMaterialsPage() {
  return (
    <>
      <PageHeader title="Study materials" description="Add, share and retire notes and practice papers." />

      <Card>
        <CardHeader>
          <CardTitle>Add material</CardTitle>
        </CardHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="m-title">
              <Input id="m-title" placeholder="e.g. Unit 5: Toxicology summary" />
            </Field>
            <Field label="Course" htmlFor="m-course">
              <Select id="m-course">
                <option>UGC NET 2026 Core</option>
                <option>Ballistics Masterclass</option>
              </Select>
            </Field>
            <Field label="Type" htmlFor="m-kind">
              <Select id="m-kind">
                <option>Note</option>
                <option>DPP</option>
                <option>Question paper</option>
                <option>Solution</option>
              </Select>
            </Field>
            <Field
              label="Google Drive link"
              htmlFor="m-link"
              hint="Sharing must be 'Anyone with the link · Viewer'."
            >
              <Input id="m-link" placeholder="https://drive.google.com/file/d/…" />
            </Field>
          </div>

          <Button size="sm" className="self-start">
            <Upload className="size-4" aria-hidden /> Add material
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Published material</CardTitle>
          <Badge variant="gray">{MATERIALS.length} items</Badge>
        </CardHeader>

        <ul className="divide-line flex flex-col divide-y">
          {MATERIALS.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            >
              <span className="bg-primary-light text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                <FileText className="size-[18px]" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink font-semibold text-balance">{m.title}</p>
                <p className="text-ink-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]">
                  <span>{m.course}</span>
                  <span aria-hidden>·</span>
                  <span>Added {m.added}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant={m.kind === 'DPP' ? 'warning' : 'info'}>{m.kind}</Badge>
                  {m.linked ? (
                    <Badge variant="success">
                      <Link2 className="size-3" aria-hidden /> Drive OK
                    </Badge>
                  ) : (
                    <Badge variant="error">Sharing not public</Badge>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  <Send className="size-4" aria-hidden /> Share
                </Button>
                <Button variant="danger-outline" size="sm">
                  <Trash2 className="size-4" aria-hidden /> Retire
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-ink-muted text-center text-xs">
        Retiring hides material from students but never deletes the file — nothing is lost by accident, and
        the action is recorded in the audit log.
      </p>
    </>
  );
}
