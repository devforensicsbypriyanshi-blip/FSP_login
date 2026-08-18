'use client';

/**
 * Last resort: the root layout itself threw, so it is NOT rendered around this.
 * That means no fonts, no globals.css, no shell — hence the inline styles and
 * the explicit <html>/<body>. Anything imported from the design system could be
 * part of what failed, so this file depends on nothing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          background: '#fdfcfb',
          color: '#1a1d29',
        }}
      >
        <main style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.375rem', marginBottom: '0.75rem' }}>The app failed to start</h1>
          <p style={{ lineHeight: 1.6, color: '#5a5f70', marginBottom: '1.5rem' }}>
            Something went wrong before the page could load. Reloading usually fixes it.
            {error.digest && (
              <>
                <br />
                <span style={{ fontSize: '0.8rem' }}>Reference: {error.digest}</span>
              </>
            )}
          </p>
          <button
            onClick={reset}
            style={{
              minHeight: '44px',
              padding: '0 1.5rem',
              borderRadius: '10px',
              border: 'none',
              background: '#1a2b4a',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload the app
          </button>
        </main>
      </body>
    </html>
  );
}
