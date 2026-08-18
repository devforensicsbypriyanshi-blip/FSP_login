/**
 * Note body rendering.
 *
 * Educators paste content out of PDFs and type notes; students read the result.
 * The obvious design — store the pasted HTML, sanitise it, render it — is the
 * one this deliberately does not use.
 *
 * Sanitising arbitrary HTML means writing a denylist you must keep ahead of
 * every parser quirk, mutation-XSS trick and namespace confusion bug ever
 * found. Get it wrong once and an educator account becomes stored XSS against
 * every student who opens the note. So: **no HTML is ever stored or trusted.**
 *
 * Notes are stored as Markdown. This renderer escapes every character of input
 * first, then emits a fixed, closed set of tags. There is no passthrough — a
 * `<script>` in the source is already `&lt;script&gt;` by the time any rule
 * runs, so it renders as the literal text an educator apparently typed. The
 * allowlist is the shape of the code rather than a list to maintain.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Inline formatting, applied to already-escaped text.
 *
 * Order matters: bold before italic, or `**a**` is read as two italics with a
 * stray asterisk. Links are last and their href is filtered separately.
 */
function inline(escaped: string): string {
  return (
    escaped
      // `code`
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      // **bold**
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      // *italic* and _italic_
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, '$1<em>$2</em>')
      // ==highlight==
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      // [text](url)
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, text: string, href: string) => {
        const safe = safeHref(href);
        if (!safe) return text;
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
      })
  );
}

/**
 * Only absolute http(s) links and in-app paths survive.
 *
 * The href arrives already HTML-escaped, so `javascript&#58;` cannot reassemble
 * into a scheme — but this checks the scheme explicitly rather than relying on
 * that, because "it happens to be safe upstream" is how these bugs return.
 */
export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(trimmed)) return trimmed;
  if (/^\/[^/\\]/.test(trimmed)) return trimmed;
  return null;
}

interface Block {
  type: 'p' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'hr' | 'pre';
  lines: string[];
}

/** A regex group that the pattern guarantees exists. `(.*)` can still match ''. */
function group(match: RegExpExecArray, index: number): string {
  return match[index] ?? '';
}

/** Groups raw lines into blocks. Blank lines end a block; that is the only rule. */
function toBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let current: Block | null = null;
  let inFence = false;

  const push = () => {
    if (current) blocks.push(current);
    current = null;
  };

  /** Continues the open block if it matches, otherwise starts a new one. */
  const open = (type: Block['type']): Block => {
    if (current?.type !== type) {
      push();
      current = { type, lines: [] };
    }
    return current;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^```/.test(line.trim())) {
      if (inFence) {
        push();
        inFence = false;
      } else {
        push();
        current = { type: 'pre', lines: [] };
        inFence = true;
      }
      continue;
    }

    if (inFence) {
      current?.lines.push(raw);
      continue;
    }

    if (line.trim() === '') {
      push();
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line.trim())) {
      push();
      blocks.push({ type: 'hr', lines: [] });
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      push();
      blocks.push({ type: group(heading, 1).length === 2 ? 'h2' : 'h3', lines: [group(heading, 2)] });
      continue;
    }

    // A single # is treated as h2 as well: the note already sits under a page
    // title, so a second h1 would be wrong in the document outline.
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      push();
      blocks.push({ type: 'h2', lines: [group(h1, 1)] });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      open('ul').lines.push(group(bullet, 1));
      continue;
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      open('ol').lines.push(group(numbered, 1));
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      open('quote').lines.push(group(quoted, 1));
      continue;
    }

    open('p').lines.push(line);
  }

  push();
  return blocks;
}

/**
 * Markdown → HTML, safe by construction.
 *
 * The returned string is only ever produced from escaped input plus the fixed
 * tags below, which is what makes it safe to pass to dangerouslySetInnerHTML.
 */
export function renderNote(markdown: string): string {
  if (!markdown?.trim()) return '';

  return toBlocks(markdown)
    .map((block) => {
      if (block.type === 'hr') return '<hr />';

      if (block.type === 'pre') {
        return `<pre><code>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
      }

      if (block.type === 'ul' || block.type === 'ol') {
        const items = block.lines.map((line) => `<li>${inline(escapeHtml(line))}</li>`).join('');
        return `<${block.type}>${items}</${block.type}>`;
      }

      if (block.type === 'quote') {
        return `<blockquote>${inline(escapeHtml(block.lines.join(' ')))}</blockquote>`;
      }

      if (block.type === 'h2' || block.type === 'h3') {
        return `<${block.type}>${inline(escapeHtml(block.lines[0] ?? ''))}</${block.type}>`;
      }

      // Soft line breaks inside a paragraph become <br>, because a pasted
      // address block or a list of case citations relies on them.
      return `<p>${block.lines.map((line) => inline(escapeHtml(line))).join('<br />')}</p>`;
    })
    .join('\n');
}

/** Rough reading time, for the "12 min read" line. 200 wpm is the usual figure. */
export function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Cleans text pasted out of a PDF.
 *
 * PDF text extraction has no concept of a paragraph: it emits one line per
 * *rendered* line, hyphenates words across those lines, and interleaves page
 * furniture. Pasted raw, a chapter arrives as several hundred one-line
 * paragraphs, which is unreadable and unusable.
 *
 * Each rule below undoes one specific artefact, and only where it is
 * unambiguous — a line ending in a full stop is left alone, because that is
 * probably a real paragraph break rather than a wrap.
 */
export function cleanPastedText(input: string): string {
  const lines = input
    .replace(/\r\n?/g, '\n')
    // Non-breaking and zero-width characters travel with PDF text and break
    // every subsequent regex in ways that are invisible on screen.
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split('\n');

  const kept: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    // Bare page numbers, and "Page 4 of 30" furniture.
    if (/^\d{1,4}$/.test(line)) continue;
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) continue;

    kept.push(line);
  }

  const out: string[] = [];

  for (const line of kept) {
    const previous = out[out.length - 1];

    if (line === '' || previous === undefined || previous === '') {
      out.push(line);
      continue;
    }

    // Never join into a heading, a list item or a quote — those are structure.
    if (/^(#{1,3}\s|[-*+]\s|\d+[.)]\s|>\s)/.test(line)) {
      out.push(line);
      continue;
    }

    // "investi-\ngation" → "investigation"
    if (/[a-z]-$/.test(previous)) {
      out[out.length - 1] = previous.slice(0, -1) + line;
      continue;
    }

    // A wrapped line: the previous one did not end a sentence and this one does
    // not start a new structural element.
    if (!/[.!?:;”"')\]]$/.test(previous) && /^[a-z(«"'‘“]/.test(line)) {
      out[out.length - 1] = `${previous} ${line}`;
      continue;
    }

    out.push(line);
  }

  return (
    out
      .join('\n')
      // Three or more blank lines is always noise.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
