/**
 * Google Drive link handling — the core of the v1 content pipeline.
 *
 * Educators paste any Drive URL; we store only the *file ID*. Pasted URLs carry
 * tracking params, differ per client, and change shape over time. The ID is
 * stable and lets us swap the rendering strategy later without a data migration.
 *
 * See docs/01-SYSTEM-ARCHITECTURE.md §6.1 and §6.4.
 */

export type DriveKind = 'file' | 'folder' | 'document' | 'spreadsheet' | 'presentation';

export interface ParsedDriveLink {
  fileId: string;
  kind: DriveKind;
}

/**
 * Drive IDs are URL-safe base64-ish: letters, digits, hyphen, underscore.
 * Modern IDs are 28–44 chars; legacy ones can be shorter, so we accept 10+
 * and rely on the server-side reachability check to reject genuine garbage.
 */
const ID = '([a-zA-Z0-9_-]{10,})';

const PATTERNS: ReadonlyArray<{ re: RegExp; kind: DriveKind }> = [
  // https://drive.google.com/file/d/{ID}/view?usp=sharing
  { re: new RegExp(`drive\\.google\\.com/file/d/${ID}`), kind: 'file' },
  // https://drive.google.com/drive/folders/{ID}?usp=drive_link
  { re: new RegExp(`drive\\.google\\.com/drive/(?:u/\\d+/)?folders/${ID}`), kind: 'folder' },
  // https://docs.google.com/document|spreadsheets|presentation/d/{ID}/edit
  { re: new RegExp(`docs\\.google\\.com/document/d/${ID}`), kind: 'document' },
  { re: new RegExp(`docs\\.google\\.com/spreadsheets/d/${ID}`), kind: 'spreadsheet' },
  { re: new RegExp(`docs\\.google\\.com/presentation/d/${ID}`), kind: 'presentation' },
  // https://drive.google.com/open?id={ID}  and  /uc?export=download&id={ID}
  { re: new RegExp(`drive\\.google\\.com/(?:open|uc)\\?(?:[^#]*&)?id=${ID}`), kind: 'file' },
  // https://drive.google.com/thumbnail?id={ID}
  { re: new RegExp(`drive\\.google\\.com/thumbnail\\?(?:[^#]*&)?id=${ID}`), kind: 'file' },
];

/**
 * Parse any Google Drive / Docs URL into a stable { fileId, kind }.
 * Also accepts a bare file ID, since educators often paste just that.
 * Returns null when the input is not recognisably Drive.
 */
export function parseDriveUrl(input: string): ParsedDriveLink | null {
  const raw = input.trim();
  if (!raw) return null;

  for (const { re, kind } of PATTERNS) {
    const match = re.exec(raw);
    if (match?.[1]) return { fileId: match[1], kind };
  }

  // Bare ID paste — only if it looks like a real one and has no URL punctuation.
  if (/^[a-zA-Z0-9_-]{25,}$/.test(raw)) {
    return { fileId: raw, kind: 'file' };
  }

  return null;
}

/** Embeddable player. Renders video AND PDF — one component covers both. */
export function driveEmbedUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Poster/banner source. We fetch this once server-side and re-upload to
 * Cloudinary — never hot-link it, because Drive throttles and cannot resize.
 */
export function driveThumbnailUrl(fileId: string, width = 1600): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}

/** Grid view of a whole folder — used when a unit's material is one folder. */
export function driveFolderEmbedUrl(fileId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${fileId}#grid`;
}

/** Human-facing link, for the "Open in Drive" fallback when the iframe is blocked. */
export function driveViewUrl(fileId: string, kind: DriveKind = 'file'): string {
  if (kind === 'folder') return `https://drive.google.com/drive/folders/${fileId}`;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Correct embed URL for any parsed link. */
export function driveEmbedFor({ fileId, kind }: ParsedDriveLink): string {
  switch (kind) {
    case 'folder':
      return driveFolderEmbedUrl(fileId);
    case 'document':
      return `https://docs.google.com/document/d/${fileId}/preview`;
    case 'spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
    case 'presentation':
      return `https://docs.google.com/presentation/d/${fileId}/embed`;
    case 'file':
    default:
      return driveEmbedUrl(fileId);
  }
}
