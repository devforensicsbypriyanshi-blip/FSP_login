import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 * CSP is intentionally strict — see docs/03-SECURITY-OPS-CICD-SCALING.md §3.1.
 *
 * The app is served from app.forensicbypriyanshi.com. Nothing here names the
 * host: every directive is `'self'` or a third party, so moving between the
 * apex, a subdomain and a Vercel preview URL needs no change.
 *
 * `'self'` on a subdomain means EXACTLY that host — app.forensicbypriyanshi.com
 * is a different origin from forensicbypriyanshi.com. That is the behaviour we
 * want: the marketing site cannot script into the app, and vice versa.
 *
 * No lh3.googleusercontent.com: Google OAuth was removed (docs Part 5 §1), so
 * there are no Google profile pictures — avatars are initials or user uploads.
 */
const CSP = [
  "default-src 'self'",
  // 'unsafe-eval' is required by Next.js in development only.
  `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  // cdn.razorpay.com serves the payment-method logos inside the checkout modal.
  "img-src 'self' data: blob: https://res.cloudinary.com https://drive.google.com https://cdn.razorpay.com",
  "font-src 'self' data:",
  'frame-src https://drive.google.com https://docs.google.com https://api.razorpay.com https://checkout.razorpay.com',
  /**
   * connect-src is the one that breaks features silently when it is wrong —
   * a blocked fetch looks like a bug in our code, not a policy refusal.
   *
   *   api.razorpay.com            checkout's own API calls
   *   lumberjack.razorpay.com     its telemetry; blocked here means a console error mid-payment
   *   *.googleapis.com (FCM)      token registration and delivery for push
   */
  [
    "connect-src 'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.cloudinary.com',
    'https://*.ingest.sentry.io',
    'https://api.razorpay.com',
    'https://lumberjack.razorpay.com',
    'https://fcmregistrations.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://fcm.googleapis.com',
  ].join(' '),
  "media-src 'self' blob: https://res.cloudinary.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * `next build` and `next dev` share .next/ by default, so running a build
   * while the dev server is up overwrites its chunks and the browser starts
   * 404-ing on CSS/JS — the page renders as unstyled HTML.
   *
   * Use `npm run build:local` while the dev server is up — it sets
   * NEXT_DIST_DIR=.next-build to keep them apart.
   *
   * `npm run build` stays a plain `next build` into .next, because Vercel runs
   * that script and expects the default output directory.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
