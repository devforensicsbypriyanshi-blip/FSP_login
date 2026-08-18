'use client';

import { Bold, Eye, Heading2, Italic, Link2, List, ListOrdered, Pencil, Quote, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cleanPastedText, renderNote } from '@/lib/notes/markdown';

/**
 * The writing surface for a text note.
 *
 * A plain textarea holding Markdown, not a contenteditable holding HTML. That
 * choice is the security model: nothing this component produces is ever treated
 * as markup — renderNote() escapes the whole string before emitting its fixed
 * set of tags. A rich-text editor would mean storing HTML, and storing HTML
 * means an educator account is one paste away from stored XSS against every
 * student who opens the note.
 *
 * What makes it feel like a word processor is the paste handling, not the
 * markup. PDF text extraction has no concept of a paragraph: it emits one line
 * per *rendered* line, hyphenates words across them, and leaves page numbers in
 * the middle. Pasted raw, a chapter arrives as several hundred one-line
 * paragraphs. cleanPastedText() undoes exactly those artefacts, and only where
 * they are unambiguous.
 */

interface Tool {
  icon: typeof Bold;
  label: string;
  /** Wraps the selection. */
  wrap?: [string, string];
  /** Prefixes each selected line. */
  prefix?: string;
}

const TOOLS: Tool[] = [
  { icon: Bold, label: 'Bold', wrap: ['**', '**'] },
  { icon: Italic, label: 'Italic', wrap: ['*', '*'] },
  { icon: Sparkles, label: 'Highlight', wrap: ['==', '=='] },
  { icon: Heading2, label: 'Heading', prefix: '## ' },
  { icon: List, label: 'Bullet list', prefix: '- ' },
  { icon: ListOrdered, label: 'Numbered list', prefix: '1. ' },
  { icon: Quote, label: 'Quote', prefix: '> ' },
  { icon: Link2, label: 'Link', wrap: ['[', '](https://)'] },
];

export function NoteEditor({
  name,
  defaultValue = '',
  id = 'bodyMd',
}: {
  name: string;
  defaultValue?: string;
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const [pasteNote, setPasteNote] = useState<string>();

  function apply(tool: Tool) {
    const field = ref.current;
    if (!field) return;

    const { selectionStart: start, selectionEnd: end } = field;
    const selected = value.slice(start, end);

    let next: string;
    let caret: number;

    if (tool.prefix) {
      // Line-based tools act on every line the selection touches, so selecting
      // a pasted block and hitting "bullet list" does the obvious thing.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const chunk = value.slice(lineStart, end) || '';
      const prefixed = chunk
        .split('\n')
        .map((line, index) => (tool.prefix === '1. ' ? `${index + 1}. ${line}` : `${tool.prefix}${line}`))
        .join('\n');
      next = value.slice(0, lineStart) + prefixed + value.slice(end);
      caret = lineStart + prefixed.length;
    } else if (tool.wrap) {
      const [before, after] = tool.wrap;
      next = value.slice(0, start) + before + selected + after + value.slice(end);
      caret = start + before.length + selected.length;
    } else {
      return;
    }

    setValue(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;

    const cleaned = cleanPastedText(text);
    // Only intervene when there was something to fix — otherwise let the
    // browser paste normally so undo behaves the way the educator expects.
    if (cleaned === text) {
      setPasteNote(undefined);
      return;
    }

    event.preventDefault();

    const field = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = field;
    const next = value.slice(0, start) + cleaned + value.slice(end);
    setValue(next);

    const removed = text.split('\n').length - cleaned.split('\n').length;
    setPasteNote(
      removed > 0
        ? `Tidied the paste: rejoined ${removed} wrapped line${removed === 1 ? '' : 's'} and dropped page numbers.`
        : 'Tidied the paste.'
    );

    requestAnimationFrame(() => {
      const caret = start + cleaned.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="border-line-medium overflow-hidden rounded-xl border">
      <div className="border-line bg-hover flex flex-wrap items-center gap-1 border-b p-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            disabled={preview}
            onClick={() => apply(tool)}
            className="text-ink-secondary hover:bg-surface hover:text-ink grid size-8 place-items-center rounded-lg transition disabled:opacity-40"
          >
            <tool.icon className="size-4" aria-hidden />
          </button>
        ))}

        <span className="flex-1" />

        <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
          {preview ? (
            <>
              <Pencil className="size-4" aria-hidden /> Write
            </>
          ) : (
            <>
              <Eye className="size-4" aria-hidden /> Preview
            </>
          )}
        </Button>
      </div>

      {preview ? (
        <div
          className="note-body bg-surface min-h-[280px] p-4"
          // Safe by construction: renderNote() escapes every character of its
          // input before emitting a fixed set of tags. See markdown.test.ts.
          dangerouslySetInnerHTML={{ __html: renderNote(value) || '<p>Nothing to preview yet.</p>' }}
        />
      ) : (
        <textarea
          ref={ref}
          id={id}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={onPaste}
          rows={16}
          spellCheck
          placeholder="Paste straight from a PDF, or write here.

## Use two hashes for a heading
- and a dash for bullets
**Bold** with two asterisks, ==highlight== with two equals."
          className="text-ink placeholder:text-ink-light w-full resize-y border-0 bg-transparent p-4 font-mono text-[13.5px] leading-relaxed outline-none"
        />
      )}

      {preview && <input type="hidden" name={name} value={value} />}

      <div className="border-line bg-hover text-ink-muted flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[12px]">
        <span>{value.trim() ? `${value.trim().split(/\s+/).length} words` : 'Empty'}</span>
        {pasteNote && <span className="text-success font-medium">{pasteNote}</span>}
      </div>
    </div>
  );
}
