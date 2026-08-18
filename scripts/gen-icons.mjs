/**
 * Generates the PWA icon set with no image dependencies.
 *
 * Motif: concentric amber rings on brand navy — a fingerprint, which is both
 * on-theme for forensics and legible at 48px where a wordmark would not be.
 *
 * Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: (x, y) => [r, g, b, a] */
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgba(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const NAVY = [29, 26, 57]; // #1D1A39 brand navy
const NAVY_DEEP = [19, 16, 36]; // #131024
const AMBER = [245, 159, 89]; // #F59F59 brand amber
const WHITE = [255, 255, 255];

/** Smooth 0..1 coverage across an edge, for cheap antialiasing. */
const smooth = (edge, value, width = 1.2) => Math.min(1, Math.max(0, (edge - value) / width + 0.5));

function makeIcon({ size, padding = 0, radiusRatio = 0.22, mono = false }) {
  const inner = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = inner * radiusRatio;

  return png(size, (x, y) => {
    // Rounded-square mask (squircle-ish via rounded rect SDF)
    const dx = Math.abs(x + 0.5 - cx) - (inner / 2 - r);
    const dy = Math.abs(y + 0.5 - cy) - (inner / 2 - r);
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
    const inShape = smooth(0, outside);
    if (inShape <= 0) return [0, 0, 0, 0];

    // Vertical brand gradient
    const t = y / size;
    const bg = mono ? WHITE : NAVY.map((c, i) => Math.round(c * (1 - t * 0.5) + NAVY_DEEP[i] * (t * 0.5)));

    // Concentric fingerprint rings
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const ringSpan = inner * 0.34;
    let ink = 0;
    for (let k = 1; k <= 4; k++) {
      const radius = (ringSpan * k) / 4;
      const thickness = inner * 0.028;
      ink = Math.max(ink, smooth(thickness, Math.abs(dist - radius)));
    }
    // Core dot
    ink = Math.max(ink, smooth(inner * 0.035, dist));

    // Break the rings on the lower right so it reads as a print, not a target
    const angle = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    if (angle > 0.5 && angle < 1.15) ink = 0;

    const fg = mono ? NAVY : AMBER;
    const rgb = [0, 1, 2].map((i) => Math.round(bg[i] * (1 - ink) + fg[i] * ink));
    return [rgb[0], rgb[1], rgb[2], Math.round(255 * inShape)];
  });
}

mkdirSync('public/icons', { recursive: true });

const outputs = [
  ['public/icons/icon-192.png', { size: 192 }],
  ['public/icons/icon-512.png', { size: 512 }],
  ['public/icons/apple-touch-icon.png', { size: 180, radiusRatio: 0.001 }],
  // Maskable icons need ~20% safe padding or Android crops the artwork.
  ['public/icons/maskable-192.png', { size: 192, padding: 20, radiusRatio: 0.5 }],
  ['public/icons/maskable-512.png', { size: 512, padding: 54, radiusRatio: 0.5 }],
  ['public/icons/badge-72.png', { size: 72, mono: true }],
  ['public/favicon-32.png', { size: 32, radiusRatio: 0.28 }],
];

for (const [file, opts] of outputs) {
  writeFileSync(file, makeIcon(opts));
  console.log('wrote', file);
}
