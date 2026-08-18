import { describe, expect, it } from 'vitest';
import { driveEmbedFor, driveEmbedUrl, driveThumbnailUrl, parseDriveUrl } from './drive';

const ID = '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWx';

describe('parseDriveUrl', () => {
  it.each([
    ['standard share link', `https://drive.google.com/file/d/${ID}/view?usp=sharing`, 'file'],
    ['share link, no query', `https://drive.google.com/file/d/${ID}/view`, 'file'],
    ['legacy open?id', `https://drive.google.com/open?id=${ID}`, 'file'],
    ['uc export', `https://drive.google.com/uc?export=download&id=${ID}`, 'file'],
    ['thumbnail', `https://drive.google.com/thumbnail?id=${ID}&sz=w400`, 'file'],
    ['folder', `https://drive.google.com/drive/folders/${ID}?usp=drive_link`, 'folder'],
    ['folder with user prefix', `https://drive.google.com/drive/u/0/folders/${ID}`, 'folder'],
    ['google doc', `https://docs.google.com/document/d/${ID}/edit`, 'document'],
    ['google sheet', `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, 'spreadsheet'],
    ['google slides', `https://docs.google.com/presentation/d/${ID}/edit`, 'presentation'],
  ])('parses a %s', (_label, url, kind) => {
    expect(parseDriveUrl(url)).toEqual({ fileId: ID, kind });
  });

  it('tolerates surrounding whitespace from a sloppy paste', () => {
    expect(parseDriveUrl(`  https://drive.google.com/file/d/${ID}/view  `)?.fileId).toBe(ID);
  });

  it('accepts a bare file ID', () => {
    expect(parseDriveUrl(ID)).toEqual({ fileId: ID, kind: 'file' });
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a non-Drive URL', 'https://youtube.com/watch?v=abc123'],
    ['a Meet link', 'https://meet.google.com/abc-defg-hij'],
    ['plain prose', 'please upload the toxicology lecture'],
    ['a too-short bare token', 'abc123'],
  ])('rejects %s', (_label, input) => {
    expect(parseDriveUrl(input)).toBeNull();
  });
});

describe('url builders', () => {
  it('builds a preview embed', () => {
    expect(driveEmbedUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/preview`);
  });

  it('builds a sized thumbnail', () => {
    expect(driveThumbnailUrl(ID, 800)).toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w800`);
  });

  it('routes each kind to its own embed host', () => {
    expect(driveEmbedFor({ fileId: ID, kind: 'folder' })).toContain('embeddedfolderview');
    expect(driveEmbedFor({ fileId: ID, kind: 'presentation' })).toContain('presentation');
    expect(driveEmbedFor({ fileId: ID, kind: 'file' })).toContain('/preview');
  });
});
