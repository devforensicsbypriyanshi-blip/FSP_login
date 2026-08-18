import { describe, expect, it } from 'vitest';
import { cleanPastedText, escapeHtml, readingMinutes, renderNote, safeHref } from './markdown';

/**
 * The security tests are the point of this file.
 *
 * renderNote() output goes to dangerouslySetInnerHTML, so "does a script tag
 * survive?" is not a style question — an educator account is one paste away
 * from stored XSS against every student who opens the note.
 */

describe('escapeHtml', () => {
  it('escapes every character that can start markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('renderNote — untrusted input', () => {
  it('renders a script tag as text, not as a script', () => {
    const html = renderNote('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not let an img onerror through', () => {
    const html = renderNote('<img src=x onerror=alert(1)>');
    // The literal text "onerror=" survives, and that is fine — it is inside an
    // escaped `&lt;img`, so there is no element for it to be an attribute of.
    // What matters is that no tag was produced.
    expect(html).not.toContain('<img');
    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('emits no tag outside the fixed allowlist, whatever the input', () => {
    const nasty = [
      '<svg/onload=alert(1)>',
      '<iframe src="//evil"></iframe>',
      '<a href="x" onclick="alert(1)">y</a>',
      '<style>*{}</style>',
      '<!--<script>-->',
      '<math><mtext></mtext></math>',
    ].join('\n\n');

    const allowed = new Set([
      'p',
      'br',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'strong',
      'em',
      'mark',
      'code',
      'pre',
      'blockquote',
      'hr',
      'a',
    ]);

    for (const match of renderNote(nasty).matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)) {
      expect(allowed).toContain((match[1] ?? '').toLowerCase());
    }
  });

  it('refuses a javascript: link and keeps the text', () => {
    const html = renderNote('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
    expect(html).toContain('click me');
  });

  it('refuses a data: link', () => {
    expect(safeHref('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
  });

  it('allows normal external and in-app links', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('/app/notes')).toBe('/app/notes');
    expect(safeHref('//evil.example.com')).toBeNull();
  });

  it('adds noopener to external links', () => {
    expect(renderNote('[x](https://example.com)')).toContain('rel="noopener noreferrer nofollow"');
  });

  it('cannot be broken out of by a quote in link text', () => {
    const html = renderNote('[a" onmouseover="alert(1)](https://example.com)');
    expect(html).not.toContain('onmouseover="');
    expect(html).toContain('&quot;');
  });
});

describe('renderNote — formatting', () => {
  it('renders headings, lists and emphasis', () => {
    expect(renderNote('## Title')).toBe('<h2>Title</h2>');
    expect(renderNote('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(renderNote('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
    expect(renderNote('**bold**')).toBe('<p><strong>bold</strong></p>');
    expect(renderNote('a *word* here')).toBe('<p>a <em>word</em> here</p>');
  });

  it('treats a single # as h2 — the page already owns the h1', () => {
    expect(renderNote('# Title')).toBe('<h2>Title</h2>');
  });

  it('keeps soft line breaks inside a paragraph', () => {
    expect(renderNote('line one\nline two')).toBe('<p>line one<br />line two</p>');
  });

  it('splits paragraphs on a blank line', () => {
    expect(renderNote('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>');
  });

  it('does not treat snake_case as emphasis', () => {
    expect(renderNote('use file_name_here now')).toBe('<p>use file_name_here now</p>');
  });

  it('escapes inside code fences', () => {
    expect(renderNote('```\n<b>x</b>\n```')).toBe('<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
  });

  it('returns empty string for empty input', () => {
    expect(renderNote('')).toBe('');
    expect(renderNote('   ')).toBe('');
  });
});

describe('cleanPastedText', () => {
  it('rejoins a wrapped sentence', () => {
    expect(cleanPastedText('The suspect was\nseen leaving.')).toBe('The suspect was seen leaving.');
  });

  it('repairs a hyphen split across lines', () => {
    expect(cleanPastedText('investi-\ngation')).toBe('investigation');
  });

  it('keeps a real paragraph break', () => {
    expect(cleanPastedText('One sentence.\nAnother one.')).toBe('One sentence.\nAnother one.');
  });

  it('drops bare page numbers and page furniture', () => {
    expect(cleanPastedText('Body text here.\n42\nPage 3 of 12\nMore text.')).toBe(
      'Body text here.\nMore text.'
    );
  });

  it('never joins into a list item or heading', () => {
    expect(cleanPastedText('Consider the following\n- first\n- second')).toBe(
      'Consider the following\n- first\n- second'
    );
  });

  it('strips zero-width and non-breaking characters', () => {
    expect(cleanPastedText('a b​c')).toBe('a bc');
  });

  it('collapses runs of blank lines', () => {
    expect(cleanPastedText('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('readingMinutes', () => {
  it('never reports zero', () => {
    expect(readingMinutes('one two three')).toBe(1);
  });

  it('scales at roughly 200 words per minute', () => {
    expect(readingMinutes(Array.from({ length: 600 }, () => 'word').join(' '))).toBe(3);
  });
});
