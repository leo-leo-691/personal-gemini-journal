import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config.js';
import { NextRequest } from 'next/server';
import { middleware, buildCsp } from '../src/middleware';

describe('Automated Security Headers Test Suite', () => {
  it('verifies the static HTTP security headers are configured globally in next.config.js', async () => {
    expect(nextConfig.headers).toBeDefined();
    if (!nextConfig.headers) throw new Error('nextConfig.headers is undefined');

    const headersList = await nextConfig.headers();
    expect(headersList.length).toBeGreaterThan(0);

    const globalHeadersConfig = headersList.find((h: any) => h.source === '/:path*');
    expect(globalHeadersConfig).toBeDefined();
    if (!globalHeadersConfig) throw new Error('globalHeadersConfig is undefined');

    const headersMap = new Map<string, string>();
    globalHeadersConfig.headers.forEach((header: { key: string; value: string }) => {
      headersMap.set(header.key, header.value);
    });

    expect(headersMap.get('Strict-Transport-Security')).toContain('max-age=63072000');
    expect(headersMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headersMap.get('X-Frame-Options')).toBe('DENY');
    expect(headersMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headersMap.get('Permissions-Policy')).toContain('camera=()');

    // CSP is deliberately NOT here — it is minted per-request with a nonce in
    // src/middleware.ts. A static header cannot carry a per-request nonce.
    expect(headersMap.has('Content-Security-Policy')).toBe(false);
  });
});

describe('Content-Security-Policy (src/middleware.ts)', () => {
  const csp = buildCsp('TESTNONCE');
  const directives = new Map(
    csp.split(';').map((d) => {
      const [name, ...rest] = d.trim().split(/\s+/);
      return [name, rest.join(' ')];
    })
  );

  it('script-src does not contain unsafe-eval (unused by the production bundle)', () => {
    expect(directives.get('script-src')).not.toContain("'unsafe-eval'");
  });

  it('script-src does not contain unsafe-inline (replaced by a nonce)', () => {
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
  });

  it('script-src carries the per-request nonce and keeps self + Firebase Auth origins', () => {
    const scriptSrc = directives.get('script-src')!;
    expect(scriptSrc).toContain("'nonce-TESTNONCE'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain('https://apis.google.com');
    expect(scriptSrc).toContain('https://www.gstatic.com');
  });

  it('style-src keeps self and the documented unsafe-inline exception', () => {
    // Required by an inline `style` attribute on the auth screen and by Next.js
    // built-in error pages; neither can carry a nonce or a stable hash.
    expect(directives.get('style-src')).toBe("'self' 'unsafe-inline'");
  });

  it('retains every other directive from the previous policy', () => {
    expect(directives.get('default-src')).toBe("'self'");
    expect(directives.get('connect-src')).toContain('https://identitytoolkit.googleapis.com');
    expect(directives.get('connect-src')).toContain('https://securetoken.googleapis.com');
    expect(directives.get('frame-src')).toContain('https://accounts.google.com');
    expect(directives.get('img-src')).toBe("'self' data: https:");
    expect(directives.get('frame-ancestors')).toBe("'none'");
    expect(directives.get('base-uri')).toBe("'self'");
    expect(directives.get('form-action')).toBe("'self'");
  });

  it('middleware() emits the CSP response header with a fresh random nonce each request', () => {
    const res1 = middleware(new NextRequest('http://localhost/journal'));
    const res2 = middleware(new NextRequest('http://localhost/journal'));

    const csp1 = res1.headers.get('Content-Security-Policy') ?? '';
    const csp2 = res2.headers.get('Content-Security-Policy') ?? '';

    const scriptSrc1 = csp1.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc1).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc1).not.toContain("'unsafe-inline'");
    expect(scriptSrc1).not.toContain("'unsafe-eval'");

    const n1 = csp1.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    const n2 = csp2.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    expect(n1).toBeTruthy();
    expect(n1).not.toBe(n2);
  });
});
