/**
 * Lists internal <Link href="..."> targets that have no corresponding page.
 * Run: node scripts/find-broken-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const routes = new Set();

function walkRoutes(dir, url = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'api') continue;
    // (group) folders don't add a URL segment
    const next = entry.name.startsWith('(') ? url : `${url}/${entry.name}`;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, 'page.tsx'))) routes.add(next || '/');
    walkRoutes(child, next);
  }
}

if (fs.existsSync('src/app/page.tsx')) routes.add('/');
walkRoutes('src/app');

const hrefs = new Map();
const HREF = /href\s*[=:]\s*["'`]([^"'`$]+)["'`]/g;

function scanFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanFiles(p);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(HREF)) {
      const href = m[1].split('?')[0].split('#')[0].replace(/\/$/, '');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      if (!hrefs.has(href)) hrefs.set(href, new Set());
      hrefs.get(href).add(p.replace(/\\/g, '/'));
    }
  }
}
scanFiles('src');

const dynamic = [...routes].filter((r) => r.includes('['));
const covered = (href) =>
  routes.has(href) || dynamic.some((d) => new RegExp(`^${d.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(href));

const broken = [...hrefs.entries()].filter(([h]) => !covered(h)).sort();

console.log(`Pages that exist : ${routes.size}`);
console.log(`Internal links   : ${hrefs.size}`);
console.log('');
console.log('BROKEN LINKS (link exists, page does not):');
if (broken.length === 0) {
  console.log('  none');
} else {
  for (const [href, files] of broken) {
    const where = [...files].map((f) => f.split('/').slice(-2).join('/')).join(', ');
    console.log(`  ${href.padEnd(22)} <- ${where}`);
  }
}
process.exitCode = 0;
