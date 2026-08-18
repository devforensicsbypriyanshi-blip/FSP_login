import type { Metadata, Viewport } from 'next';
import { Inter, Poppins, DM_Serif_Display } from 'next/font/google';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import './globals.css';

// Self-hosted by next/font: no render-blocking request to fonts.googleapis.com
// and no layout shift, unlike the @import the static HTML package used.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

// DM Serif Display — editorial/hero headlines per brand guidelines.
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-dm-serif',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Forensic Science by Priyanshi',
    template: '%s · Forensic Science by Priyanshi',
  },
  description:
    'UGC NET & Forensic Science exam preparation — live classes, recorded lectures, mock tests, notes, DPPs and 1:1 mentorship with Priyanshi Verma.',
  applicationName: 'FSP',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FSP',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // iOS ignores the manifest for the home-screen icon and uses this instead.
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'Forensic Science by Priyanshi',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#1D1A39',
  width: 'device-width',
  initialScale: 1,
  // Do NOT set maximumScale/userScalable=false — it breaks pinch-zoom for
  // low-vision users and fails the accessibility gate in CI.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} ${dmSerif.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        <PwaProvider />
      </body>
    </html>
  );
}
