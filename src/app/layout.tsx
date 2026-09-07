import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Newsreader, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';

/**
 * Fonts are loaded through `next/font/google`, which SELF-HOSTS the files at
 * build time and serves them from the app's own origin.
 *
 * This is deliberate and required: the CSP in next.config.js declares
 * `style-src 'self' 'unsafe-inline'` with no Google Fonts origin, and `font-src`
 * falls back to `default-src 'self'`. A <link rel="stylesheet"> pointing at
 * fonts.googleapis.com would be blocked and the design would silently fall back
 * to system fonts. Do not replace this with a <link> tag.
 */
const serif = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif',
  // Next 14.2.3 has no font-metric overrides for Newsreader, which otherwise
  // logs "Failed to find font override values" at build. The CSS stack in
  // tailwind.config.js (`Georgia, serif`) is the fallback.
  adjustFontFallback: false,
});

const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Personal Gemini Journal',
  description: 'A secure, private AI journaling app powered by Gemini',
};

/**
 * Pre-hydration theme resolution. Without this the app paints dark and then
 * repaints light for light-theme users. The inline script carries the
 * per-request CSP nonce minted in `src/middleware.ts` (read here from the
 * `x-nonce` request header), so `script-src` no longer needs `'unsafe-inline'`.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('pgj-theme');var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches;if(s==='light'||(!s&&m)){document.documentElement.classList.add('theme-light')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = headers().get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased bg-canvas text-ink">{children}</body>
    </html>
  );
}
